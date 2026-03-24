// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * Tool handler factory.
 *
 * Creates MCP tool handler functions from DiscoveredTool definitions.
 */

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
    let path = tool.httpPath;
    for (const param of tool.pathParams) {
      path = path.replace(`{${param}}`, encodeURIComponent(String(args[param])));
    }

    // Separate query params
    const queryParams: Record<string, any> = {};
    for (const param of tool.queryParams) {
      if (args[param] !== undefined) {
        queryParams[param] = args[param];
      }
    }

    // Build body: everything that's not a path param or query param
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

    try {
      const result = await client.callApi(
        tool.httpMethod,
        path,
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
