#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * MCP server for the Phiacta knowledge platform.
 *
 * Auto-discovers all tools from the backend's OpenAPI spec at startup.
 *
 * Environment variables:
 *   PHIACTA_API_URL   — API base URL (default: https://api.phiacta.com)
 *   PHIACTA_HANDLE    — User handle for authentication
 *   PHIACTA_PASSWORD  — User password for authentication
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PhiactaClient } from "./client.js";
import { discoverTools } from "./discovery.js";
import { registerDiscoveredTools } from "./register.js";
import { registerPrompts } from "./prompts.js";

const API_URL = process.env.PHIACTA_API_URL ?? "https://api.phiacta.com";
const PHIACTA_HANDLE = process.env.PHIACTA_HANDLE ?? "";
const PHIACTA_PASSWORD = process.env.PHIACTA_PASSWORD ?? "";

async function main() {
  const server = new McpServer(
    {
      name: "phiacta",
      version: "0.1.0",
    },
    {
      instructions: [
        "Phiacta is a knowledge platform where information is stored as **entries**.",
        "",
        "An entry is a single, versioned, citable unit of knowledge. Entries are **atomic** — each one represents exactly one thing (a definition, a theorem, a claim, a result, etc.). Do not combine multiple ideas into one entry.",
        "",
        "Larger structures (like papers, arguments, or reviews) are represented by an entry that references its component entries.",
        "",
        "Use the available tools to create, search, and manage entries. Each tool's schema describes its parameters.",
      ].join("\n"),
    }
  );

  const client = new PhiactaClient(API_URL);

  // Login if credentials are provided
  if (PHIACTA_HANDLE && PHIACTA_PASSWORD) {
    await client.login(PHIACTA_HANDLE, PHIACTA_PASSWORD);
  }

  // Fetch OpenAPI spec and discover tools
  const spec = await client.fetchOpenApiSpec();
  const tools = discoverTools(spec);

  // Register all discovered tools
  registerDiscoveredTools(server, tools, client);

  // Register prompts
  registerPrompts(server);

  console.error(
    `Discovered ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`
  );

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
