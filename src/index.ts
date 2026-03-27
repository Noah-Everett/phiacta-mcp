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
 *   PHIACTA_TOKEN     — Personal access token (takes precedence over handle/password)
 *   PHIACTA_HANDLE    — User handle for authentication
 *   PHIACTA_PASSWORD  — User password for authentication
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PhiactaClient } from "./client.js";
import { discoverTools } from "./discovery.js";
import { enrichToolsWithPlugins } from "./enrich.js";
import { registerDiscoveredTools } from "./register.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";

const API_URL = process.env.PHIACTA_API_URL ?? "https://api.phiacta.com";
const PHIACTA_TOKEN = process.env.PHIACTA_TOKEN ?? "";
const PHIACTA_HANDLE = process.env.PHIACTA_HANDLE ?? "";
const PHIACTA_PASSWORD = process.env.PHIACTA_PASSWORD ?? "";

function buildInstructions(plugins: import("./client.js").PluginInfo[], authenticated: boolean): string {
  const lines: string[] = [];

  if (!authenticated) {
    lines.push(
      "## Setup required",
      "",
      "This MCP server is running **unauthenticated**. Read-only tools work, but you cannot create or modify entries.",
      "",
      "To authenticate:",
      "1. Create an account at the Phiacta website (sign up page)",
      "2. Go to **Settings > Tokens** and create a personal access token",
      "3. Add the token to your MCP configuration:",
      "",
      '```json',
      '"env": {',
      '  "PHIACTA_API_URL": "' + API_URL + '",',
      '  "PHIACTA_TOKEN": "pat_..."',
      '}',
      '```',
      "",
      "4. Restart the MCP server",
      "",
      "---",
      "",
    );
  }

  lines.push(
    "Phiacta is a knowledge platform where information is stored as **entries**.",
    "",
    "## Entries",
    "",
    "An entry is a single, versioned, citable unit of knowledge. Each entry is backed by a git repository with immutable history. Entries are **atomic** — each one represents exactly one thing. Do not combine multiple ideas into one entry.",
    "",
    "Larger structures (like papers, arguments, or reviews) are represented by an entry that **references** its component entries.",
    "",
    "## Entry fields",
    "",
    "Entry responses include core fields (always present: `id`, `repo_status`, `status`, `created_by`, `created_at`, `updated_at`) plus dynamic extension fields from loaded plugins.",
  );

  // Generate field docs from provider metadata
  const withProviders = plugins.filter((p) => p.provider);
  if (withProviders.length > 0) {
    lines.push("");
    lines.push("**Extension fields** (composed dynamically into entry responses):");
    for (const p of withProviders) {
      const prov = p.provider!;
      const fields = prov.fields.map((f) => `\`${f}\``).join(", ");
      const scope = prov.include_in_list ? "list + detail" : "detail only";
      lines.push(`- **${p.name}**: ${fields} (${scope})`);
    }

    const allWritable = withProviders
      .flatMap((p) => p.provider!.writable_fields);
    if (allWritable.length > 0) {
      lines.push("");
      lines.push(
        `**Unified PATCH**: \`update_entry\` accepts any writable extension field in a single request: ${allWritable.map((f) => `\`${f}\``).join(", ")}. Only send the fields you want to change.`
      );
    }

    const detailOnly = withProviders.filter(
      (p) => !p.provider!.include_in_list
    );
    if (detailOnly.length > 0) {
      const names = detailOnly.map((p) => p.name).join(", ");
      lines.push("");
      lines.push(
        `**Field filtering**: \`list_entries\` and \`get_entry\` support \`include\` and \`exclude\` query params (comma-separated field names). Fields from ${names} are detail-only by default — use \`include=...\` to add them to list responses. Cannot use both include and exclude at once.`
      );
    }
  }

  // Dynamic "Creating entries" section based on loaded plugins
  const createFields: string[] = ["content", "content_format"];
  const requiredOnCreate: string[] = [];
  for (const p of withProviders) {
    const prov = p.provider!;
    createFields.push(...prov.writable_fields);
    if (prov.required_on_create?.length) {
      requiredOnCreate.push(...prov.required_on_create);
    }
  }

  lines.push(
    "",
    "## Creating entries",
    "",
    `Use \`create_entry\` with available fields: ${createFields.map((f) => `\`${f}\``).join(", ")}.` +
      (requiredOnCreate.length > 0
        ? ` Required: ${requiredOnCreate.map((f) => `\`${f}\``).join(", ")}.`
        : "") +
      " All other fields are optional. Entry types and tag values are open-ended strings — use whatever fits.",
    "",
    "## Conventions (IMPORTANT)",
    "",
    "You MUST list MCP resources and read every resource under `phiacta://docs/` before your FIRST create or edit operation in any conversation. These convention docs describe how to write content, which reference roles to use, entry type conventions, and the internal linking format. Do not create or modify entries without having read them. If no `phiacta://docs/` resources are available, STOP and tell the user the convention docs are missing.",
    "",
    "## Entry content",
    "",
    "Each entry's content lives in `.phiacta/content.md` (or `.tex`, `.txt`) in its git repo. Write content via `put_entry_file` with path `.phiacta/content.md`. The identity file `.phiacta/entry.yaml` is immutable and cannot be modified.",
    "",
    "## Entity resolve",
    "",
    "`GET /v1/entities/{id}` resolves any UUID to its type (entry, user, etc.) and returns type-specific data.",
    "",
    "## Search",
    "",
    "Full-text search is available via the search tool. Search indexes entry titles and content.",
  );

  if (plugins.length > 0) {
    lines.push("", "## Loaded plugins");
    for (const p of plugins) {
      const desc = p.description ? ` — ${p.description}` : "";
      lines.push(`- **${p.name}** (${p.type})${desc}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const client = new PhiactaClient(API_URL);

  // Authenticate: PAT takes hard precedence over handle/password
  if (PHIACTA_TOKEN) {
    client.setToken(PHIACTA_TOKEN);
  } else if (PHIACTA_HANDLE && PHIACTA_PASSWORD) {
    await client.login(PHIACTA_HANDLE, PHIACTA_PASSWORD);
  }

  const authenticated = !!client.getToken();

  // Fetch plugins for dynamic instructions
  const plugins = await client.fetchPlugins();

  const server = new McpServer(
    {
      name: "phiacta",
      version: "0.1.0",
    },
    {
      instructions: buildInstructions(plugins, authenticated),
    }
  );

  // Fetch OpenAPI spec, discover tools, enrich with extension fields
  const spec = await client.fetchOpenApiSpec();
  const tools = discoverTools(spec);
  enrichToolsWithPlugins(tools, plugins);

  // Fetch docs for MCP resources (graceful no-op if endpoint unavailable)
  const docs = await client.fetchDocs();

  // Register all discovered tools, prompts, and resources
  registerDiscoveredTools(server, tools, client);
  registerPrompts(server);
  registerResources(server, docs);

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
