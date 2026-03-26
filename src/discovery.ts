// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * OpenAPI-to-MCP tool discovery module.
 *
 * Parses an OpenAPI spec and produces DiscoveredTool descriptors
 * for all qualifying operations.
 */

import { fromJSONSchema } from "zod";
import type { ZodType } from "zod";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export interface DiscoveredTool {
  name: string;
  description: string;
  zodSchema: ZodType;
  httpMethod: string;
  httpPath: string;
  requiresAuth: boolean;
  pathParams: string[];
  queryParams: string[];
  hasBody: boolean;
  isMultipart: boolean;
  annotations: Record<string, boolean>;
  rawJsonSchema: any;
}

/**
 * Strip the auto-generated FastAPI suffix from an operationId.
 * "list_entries_v1_entries_get" -> "list_entries"
 */
export function cleanToolName(operationId: string): string {
  const idx = operationId.indexOf("_v1_");
  if (idx <= 0) return operationId;
  return operationId.slice(0, idx);
}

/**
 * Strip `format` from a JSON Schema object (shallow).
 * Format validation is the backend's responsibility — the MCP schema
 * should be permissive to avoid rejecting valid LLM inputs.
 */
export function stripFormat(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  const { format, ...rest } = schema;
  return rest;
}

/**
 * Resolve $ref pointers in a JSON Schema object against the full OpenAPI spec.
 * Handles nested $ref in properties, items, and anyOf. Detects circular refs.
 */
function resolveRefs(spec: any, schema: any, seen = new Set<string>()): any {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map((s) => resolveRefs(spec, s, seen));

  if (schema.$ref && typeof schema.$ref === "string") {
    if (seen.has(schema.$ref)) return schema; // circular ref, bail
    const nextSeen = new Set(seen);
    nextSeen.add(schema.$ref);

    const refPath = schema.$ref.replace(/^#\//, "").split("/");
    let target = spec;
    for (const part of refPath) {
      target = target?.[part];
    }
    if (!target) return schema;
    return resolveRefs(spec, target, nextSeen);
  }

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (typeof value === "object" && value !== null) {
      result[key] = resolveRefs(spec, value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parse an OpenAPI spec and return DiscoveredTool[] for all qualifying operations.
 */
export function discoverTools(openApiSpec: any): DiscoveredTool[] {
  const paths = openApiSpec?.paths;
  if (!paths) return [];

  const tools: DiscoveredTool[] = [];

  for (const [path, pathItem] of Object.entries<any>(paths)) {
    if (!path.startsWith("/v1/")) continue;
    // Skip auth endpoints except /me (useful for "whoami")
    if (path.startsWith("/v1/auth/") && path !== "/v1/auth/me") continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;

      const operationId = operation.operationId;
      if (!operationId) continue;

      try {
        const tool = buildTool(openApiSpec, path, method, operation);
        tools.push(tool);
      } catch (err) {
        console.warn(
          `Skipping ${method.toUpperCase()} ${path} (${operationId}): failed to build tool — ${err}`
        );
      }
    }
  }

  // Post-process: enrich multipart upload tools with MCP-only parameters.
  enrichMultipartTools(tools);

  return tools;
}

/**
 * Enrich multipart upload tools with MCP-only parameters.
 *
 * Replaces the binary `content` field from the OpenAPI spec with:
 * - `content` (string): raw text content, encoded to UTF-8 by the handler
 * - `file_path` (string): local file path, read by the handler
 *
 * These are MCP-layer convenience parameters — the backend only sees
 * multipart file bytes regardless of source.
 */
function enrichMultipartTools(tools: DiscoveredTool[]): void {
  for (const tool of tools) {
    if (!tool.isMultipart) continue;

    const schema = tool.rawJsonSchema;
    if (!schema?.properties) continue;

    // Replace the binary content field with text content + file_path
    schema.properties.content = {
      type: "string",
      description: "Raw text content to upload. The handler encodes it to UTF-8 bytes.",
    };
    schema.properties.file_path = {
      type: "string",
      description: "Local file path to upload. Must be within the current working directory.",
    };

    // content is no longer strictly required — one of content or file_path is
    if (schema.required) {
      schema.required = schema.required.filter((r: string) => r !== "content");
    }

    // Rebuild zod schema from the enriched JSON schema
    tool.zodSchema = fromJSONSchema(schema, {
      defaultTarget: "draft-2020-12",
    });
  }
}

// Body schemas must be object type (or omit type entirely)
const VALID_BODY_TYPES = new Set(["object", undefined]);

function buildTool(spec: any, path: string, method: string, operation: any): DiscoveredTool {
  const operationId = operation.operationId;
  const name = cleanToolName(operationId);

  const parts: string[] = [];
  if (operation.summary) parts.push(operation.summary);
  if (operation.description) parts.push(operation.description);
  const description = parts.join(" — ") || name;

  const pathParams: string[] = [];
  const queryParams: string[] = [];
  const paramSchemaProps: Record<string, any> = {};
  const requiredParams: string[] = [];

  for (const param of operation.parameters ?? []) {
    const paramName = param.name;
    const paramSchema = stripFormat(param.schema ?? { type: "string" });

    if (param.in === "path") {
      pathParams.push(paramName);
      paramSchemaProps[paramName] = paramSchema;
      requiredParams.push(paramName);
    } else if (param.in === "query") {
      queryParams.push(paramName);
      paramSchemaProps[paramName] = paramSchema;
      if (param.required) requiredParams.push(paramName);
    }
  }

  const hasBody = !!operation.requestBody;
  const requestContent = operation.requestBody?.content;
  const isMultipart = !!requestContent?.["multipart/form-data"];
  const rawBodySchema =
    requestContent?.["application/json"]?.schema ??
    requestContent?.["multipart/form-data"]?.schema;
  // Resolve $ref pointers before accessing properties
  const bodySchema = rawBodySchema ? resolveRefs(spec, rawBodySchema) : undefined;

  // Validate body schema — must be an object type (or omit type)
  if (hasBody && bodySchema) {
    if (!VALID_BODY_TYPES.has(bodySchema.type)) {
      throw new Error(`Unsupported body schema type: ${bodySchema.type}`);
    }
  }

  if (bodySchema?.properties) {
    const existingNames = new Set([...pathParams, ...queryParams]);
    for (const bName of Object.keys(bodySchema.properties)) {
      if (existingNames.has(bName)) {
        console.warn(
          `Parameter name collision: "${bName}" exists in both path/query params and body for ${name}`
        );
      }
    }
  }

  let mergedSchema: any;

  if (hasBody && bodySchema) {
    // Strip format from body schema properties too
    const bodyProps: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(bodySchema.properties ?? {})) {
      bodyProps[k] = stripFormat(v);
    }

    mergedSchema = {
      type: "object",
      properties: {
        ...bodyProps,
        ...paramSchemaProps,  // params take precedence over body on collision
      },
      required: [
        ...requiredParams,
        ...(bodySchema.required ?? []),
      ],
    };
  } else {
    mergedSchema = {
      type: "object",
      properties: paramSchemaProps,
      required: requiredParams,
    };
  }

  if (mergedSchema.required && mergedSchema.required.length === 0) {
    delete mergedSchema.required;
  }

  if (Object.keys(mergedSchema.properties).length === 0) {
    delete mergedSchema.properties;
  }

  const zodSchema = fromJSONSchema(mergedSchema, {
    defaultTarget: "draft-2020-12",
  });

  const requiresAuth = Array.isArray(operation.security) && operation.security.length > 0;

  const annotations: Record<string, boolean> = {};
  if (method === "get") {
    annotations.readOnlyHint = true;
  } else if (requiresAuth) {
    annotations.destructiveHint = true;
  }

  return {
    name,
    description,
    zodSchema,
    httpMethod: method,
    httpPath: path,
    requiresAuth,
    pathParams,
    queryParams,
    hasBody,
    isMultipart,
    annotations,
    rawJsonSchema: mergedSchema,
  };
}
