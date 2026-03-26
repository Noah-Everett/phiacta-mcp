// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * Tool handler factory.
 *
 * Creates MCP tool handler functions from DiscoveredTool definitions.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { DiscoveredTool } from "./discovery.js";
import type { PhiactaClient } from "./client.js";

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export type ToolHandler = (args: Record<string, any>) => Promise<ToolResult>;

/**
 * Create a handler function for a discovered tool.
 */
export function createToolHandler(
  tool: DiscoveredTool,
  client: PhiactaClient
): ToolHandler {
  return async (args: Record<string, any>): Promise<ToolResult> => {
    // Interpolate path parameters
    let urlPath = tool.httpPath;
    for (const param of tool.pathParams) {
      urlPath = urlPath.replace(`{${param}}`, encodeURIComponent(String(args[param])));
    }

    // Separate query params
    const queryParams: Record<string, any> = {};
    for (const param of tool.queryParams) {
      if (args[param] !== undefined) {
        queryParams[param] = args[param];
      }
    }

    try {
      // Multipart upload path
      if (tool.isMultipart) {
        // Append query params to URL if any
        if (Object.keys(queryParams).length > 0) {
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(queryParams)) {
            if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
          }
          urlPath += `?${qs.toString()}`;
        }
        return await handleMultipartTool(urlPath, args, tool, client);
      }

      // Standard JSON path
      let body: Record<string, any> | undefined;
      if (tool.hasBody) {
        const exclude = new Set([...tool.pathParams, ...tool.queryParams]);
        body = {};
        for (const [k, v] of Object.entries(args)) {
          if (!exclude.has(k)) {
            body[k] = v;
          }
        }
      }

      const result = await client.callApi(
        tool.httpMethod,
        urlPath,
        Object.keys(queryParams).length > 0 ? queryParams : undefined,
        body,
        tool.requiresAuth
      );

      // Format as MCP content
      if (typeof result === "string") {
        return { content: [{ type: "text", text: result }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  };
}

/**
 * Handle a multipart file upload tool call.
 *
 * Accepts either `content` (raw text string) or `file_path` (local file).
 * Resolves to bytes and sends via client.uploadFile().
 */
async function handleMultipartTool(
  urlPath: string,
  args: Record<string, any>,
  tool: DiscoveredTool,
  client: PhiactaClient
): Promise<ToolResult> {
  const contentArg = args.content as string | undefined;
  const filePathArg = args.file_path as string | undefined;
  const messageArg = args.message as string | undefined;

  // Validate: exactly one of content or file_path
  if (contentArg !== undefined && filePathArg !== undefined) {
    return {
      content: [{ type: "text", text: "Provide either 'content' or 'file_path', not both." }],
      isError: true,
    };
  }
  if (contentArg === undefined && filePathArg === undefined) {
    return {
      content: [{ type: "text", text: "Either 'content' (text string) or 'file_path' (local file) is required." }],
      isError: true,
    };
  }

  let fileBytes: Uint8Array;

  if (contentArg !== undefined) {
    // Text content: encode to UTF-8 bytes
    fileBytes = new TextEncoder().encode(contentArg);
  } else {
    // File path: validate and read
    const resolved = path.resolve(filePathArg!);

    // Validate file exists and is a regular file
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) {
        return {
          content: [{ type: "text", text: `file_path '${filePathArg}' is not a regular file.` }],
          isError: true,
        };
      }
    } catch {
      return {
        content: [{ type: "text", text: `file_path '${filePathArg}' does not exist or cannot be accessed.` }],
        isError: true,
      };
    }

    fileBytes = new Uint8Array(await fs.readFile(resolved));
  }

  const result = await client.uploadFile(urlPath, fileBytes, messageArg);

  if (typeof result === "string") {
    return { content: [{ type: "text", text: result }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
