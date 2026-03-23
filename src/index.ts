#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * MCP server for the Phiacta knowledge platform.
 *
 * Environment variables:
 *   PHIACTA_API_URL   — API base URL (default: http://localhost:8000)
 *   PHIACTA_HANDLE    — User handle for authentication
 *   PHIACTA_PASSWORD  — User password for authentication
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PhiactaClient } from "./client.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = process.env.PHIACTA_API_URL ?? "https://api.phiacta.com";
const PHIACTA_HANDLE = process.env.PHIACTA_HANDLE ?? "";
const PHIACTA_PASSWORD = process.env.PHIACTA_PASSWORD ?? "";

// ---------------------------------------------------------------------------
// Client (lazy init)
// ---------------------------------------------------------------------------

let client: PhiactaClient | null = null;

async function getClient(): Promise<PhiactaClient> {
  if (!client) {
    const c = new PhiactaClient(API_URL);
    if (PHIACTA_HANDLE && PHIACTA_PASSWORD) {
      await c.login(PHIACTA_HANDLE, PHIACTA_PASSWORD);
    }
    client = c;
  }
  return client;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "phiacta",
  version: "0.1.0",
});

// ---- Discovery tools ----

server.tool(
  "list_entries",
  "List entries in Phiacta with pagination. Use this to see what knowledge already exists before adding new entries.",
  {
    limit: z.number().min(1).max(200).default(50).describe("Max entries to return"),
    offset: z.number().min(0).default(0).describe("Pagination offset"),
    layout_hint: z
      .enum(["law", "theorem", "assertion", "evidence", "definition", "hypothesis"])
      .optional()
      .describe("Filter by type"),
    status: z
      .enum(["active", "archived"])
      .default("active")
      .describe("Filter by status"),
  },
  async ({ limit, offset, layout_hint, status }) => {
    const c = await getClient();
    const result = await c.listEntries({ limit, offset, layout_hint, status });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_entry",
  "Get full details for a single entry, including its incoming and outgoing references.",
  {
    entry_id: z.string().uuid().describe("UUID of the entry"),
  },
  async ({ entry_id }) => {
    const c = await getClient();
    const result = await c.getEntry(entry_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "search_entries_by_tags",
  "Find entries matching one or more tags.",
  {
    tags: z
      .string()
      .describe('Comma-separated tag names (e.g. "physics,classical-mechanics")'),
    mode: z
      .enum(["or", "and"])
      .default("or")
      .describe('"or" matches any tag, "and" requires all'),
    limit: z.number().min(1).max(200).default(50).describe("Max results"),
    offset: z.number().min(0).default(0).describe("Pagination offset"),
  },
  async ({ tags, mode, limit, offset }) => {
    const c = await getClient();
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const result = await c.findEntriesByTags({ tags: tagList, mode, limit, offset });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_entry_tags",
  "Get tags for an entry.",
  {
    entry_id: z.string().uuid().describe("UUID of the entry"),
  },
  async ({ entry_id }) => {
    const c = await getClient();
    const result = await c.getEntryTags(entry_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_entry_references",
  "Get references (links) for an entry.",
  {
    entry_id: z.string().uuid().describe("UUID of the entry"),
    direction: z
      .enum(["both", "incoming", "outgoing"])
      .default("both")
      .describe("Which direction of refs to return"),
  },
  async ({ entry_id, direction }) => {
    const c = await getClient();
    const result = await c.getEntryReferences(entry_id, direction);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ---- Creation tools ----

server.tool(
  "create_entry",
  "Create a new knowledge entry. Each entry should be an atomic piece of knowledge — a single law, theorem, principle, definition, observation, or hypothesis.",
  {
    title: z.string().describe('Clear, concise name (e.g. "Newton\'s Second Law")'),
    summary: z.string().describe("One-sentence description of the knowledge"),
    layout_hint: z
      .enum(["law", "theorem", "assertion", "evidence", "definition", "hypothesis"])
      .default("assertion")
      .describe("Type of knowledge"),
    content_format: z
      .enum(["markdown", "latex", "plain"])
      .default("markdown")
      .describe("Format for content"),
    license: z.string().optional().describe("SPDX license identifier"),
    content: z.string().optional().describe("Detailed content/explanation"),
  },
  async ({ title, summary, layout_hint, content_format, license, content }) => {
    const c = await getClient();
    const result = await c.createEntry({
      title,
      summary,
      layout_hint,
      content_format,
      license,
      content,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_entry_ref",
  "Create a typed reference between two entries. The direction matters: from_entry relates TO to_entry.",
  {
    from_entry_id: z.string().uuid().describe("UUID of the source entry"),
    to_entry_id: z.string().uuid().describe("UUID of the target entry"),
    rel: z
      .enum([
        "generalizes",
        "specializes",
        "derives",
        "supports",
        "extends",
        "related_to",
      ])
      .describe("Relationship type"),
    note: z.string().optional().describe("Optional note explaining the relationship"),
  },
  async ({ from_entry_id, to_entry_id, rel, note }) => {
    const c = await getClient();
    const result = await c.createEntryRef({ from_entry_id, to_entry_id, rel, note });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "set_entry_tags",
  'Set tags on an entry (replaces all existing tags). Use lowercase, hyphenated names (e.g. "physics", "classical-mechanics").',
  {
    entry_id: z.string().uuid().describe("UUID of the entry"),
    tags: z
      .string()
      .describe('Comma-separated tag names (e.g. "physics,classical-mechanics")'),
  },
  async ({ entry_id, tags }) => {
    const c = await getClient();
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const result = await c.setEntryTags(entry_id, tagList);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ---- Modification tools ----

server.tool(
  "update_entry",
  "Update an existing entry's metadata. Only provided fields are changed.",
  {
    entry_id: z.string().uuid().describe("UUID of the entry to update"),
    title: z.string().optional().describe("New title"),
    summary: z.string().optional().describe("New summary"),
    layout_hint: z
      .enum(["law", "theorem", "assertion", "evidence", "definition", "hypothesis"])
      .optional()
      .describe("New layout hint"),
    content_format: z
      .enum(["markdown", "latex", "plain"])
      .optional()
      .describe("New content format"),
    license: z.string().optional().describe("New license"),
  },
  async ({ entry_id, title, summary, layout_hint, content_format, license }) => {
    const c = await getClient();
    const result = await c.updateEntry(entry_id, {
      title,
      summary,
      layout_hint,
      content_format,
      license,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
