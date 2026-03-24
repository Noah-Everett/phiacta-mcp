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
        "Larger structures (like papers, arguments, or reviews) are represented by an entry whose `layout_hint` is `argument` that references its component entries.",
        "",
        "Each entry has:",
        "- A git-backed repository for versioned content files (README.md, data, etc.)",
        "- Metadata: title, summary, layout_hint (open-ended type string)",
        "- Tags (extension): categorization labels for discoverability",
        "- Refs (references to other entries): typed links with roles like `derives_from`, `evidence`, `rebuttal`, `supersedes`, `citation`, `context`",
        "",
        "Refs are currently created by writing a `.phiacta/refs.yaml` file in the entry's repository via `put_entry_file`. The ingestion pipeline then processes them into the database. Both the source and target entries must exist.",
        "",
        "Use `search_entries` to find existing entries before creating duplicates.",
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
