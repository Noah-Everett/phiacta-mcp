// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * Register discovered tools with an MCP server instance.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DiscoveredTool } from "./discovery.js";
import type { PhiactaClient } from "./client.js";
import { createToolHandler } from "./handler.js";

export function registerDiscoveredTools(
  server: McpServer,
  tools: DiscoveredTool[],
  client: PhiactaClient
): void {
  for (const tool of tools) {
    const handler = createToolHandler(tool, client);

    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.zodSchema,
      annotations: tool.annotations as any,
    }, async (args: any) => {
      return handler(args);
    });
  }
}
