// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * MCP resource registration — pure bridge.
 *
 * Fetches docs from the backend's /v1/docs endpoint and registers each
 * as an MCP resource.  The MCP server owns no content — all domain
 * documentation lives in the backend.
 *
 * Convention docs (content-guide, reference-roles, entry-types,
 * linking-format) are served by the backend from markdown files in
 * src/phiacta/docs/.  To add or update conventions, edit those files
 * in the backend repo — no MCP server changes needed.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DocInfo } from "./client.js";

/**
 * Register backend-served docs as MCP resources.
 *
 * Each doc becomes a `phiacta://docs/{slug}` resource that agents can
 * read on demand.  If the backend returns no docs (or the endpoint
 * doesn't exist yet), this is a no-op.
 */
export function registerResources(
  server: McpServer,
  docs: DocInfo[],
): void {
  for (const doc of docs) {
    const uri = `phiacta://docs/${doc.slug}`;
    server.resource(
      doc.name,
      uri,
      { description: doc.description, mimeType: "text/markdown" },
      async () => ({
        contents: [{ uri, text: doc.content, mimeType: "text/markdown" }],
      }),
    );
  }
}
