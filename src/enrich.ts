// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * Post-discovery enrichment of tool schemas with extension field metadata.
 *
 * The OpenAPI spec's EntryCreate/EntryUpdate schemas only list core fields
 * (content, content_format) because extension fields pass through Pydantic's
 * extra="allow".  This module injects those extension fields as named
 * properties by mining their schemas from the corresponding setter tools
 * (e.g., set_tags → tags field schema) and adding them to create_entry
 * and update_entry.
 */

import { fromJSONSchema } from "zod";
import type { DiscoveredTool } from "./discovery.js";
import { stripFormat } from "./discovery.js";
import type { PluginInfo } from "./client.js";

/** Tools whose schemas should be enriched with extension fields. */
const ENRICHMENT_TARGETS = new Set(["create_entry", "update_entry"]);

/**
 * Enrich create_entry and update_entry tool schemas with extension field
 * properties derived from plugin metadata and other discovered tool schemas.
 *
 * Mutates the tools in place — rawJsonSchema is updated and zodSchema is
 * rebuilt from the enriched JSON schema.
 */
export function enrichToolsWithPlugins(
  tools: DiscoveredTool[],
  plugins: PluginInfo[],
): void {
  if (plugins.length === 0) return;

  // Collect writable fields and required-on-create from plugin providers.
  const writableFields = new Set<string>();
  const requiredOnCreate = new Set<string>();
  for (const plugin of plugins) {
    if (!plugin.provider) continue;
    for (const field of plugin.provider.writable_fields) {
      writableFields.add(field);
    }
    for (const field of plugin.provider.required_on_create) {
      requiredOnCreate.add(field);
    }
  }

  if (writableFields.size === 0) return;

  // Mine field schemas from all discovered tools.  For example, set_tags
  // has a "tags" property with a full array schema — reuse that.
  const fieldSchemaMap = new Map<string, any>();
  for (const tool of tools) {
    if (ENRICHMENT_TARGETS.has(tool.name)) continue; // skip targets themselves
    const props = tool.rawJsonSchema?.properties;
    if (!props) continue;
    for (const [name, schema] of Object.entries<any>(props)) {
      if (writableFields.has(name) && !fieldSchemaMap.has(name)) {
        fieldSchemaMap.set(name, stripFormat(schema));
      }
    }
  }

  // Inject into target tools.
  for (const tool of tools) {
    if (!ENRICHMENT_TARGETS.has(tool.name)) continue;

    const schema = tool.rawJsonSchema;
    if (!schema) continue;
    if (!schema.properties) schema.properties = {};

    let modified = false;
    for (const field of writableFields) {
      if (field in schema.properties) continue; // don't overwrite existing
      const fieldSchema = fieldSchemaMap.get(field) ?? { type: "string" };
      schema.properties[field] = fieldSchema;
      modified = true;
    }

    // Mark required_on_create fields as required on create_entry only.
    if (tool.name === "create_entry" && requiredOnCreate.size > 0) {
      if (!schema.required) schema.required = [];
      for (const field of requiredOnCreate) {
        if (!schema.required.includes(field)) {
          schema.required.push(field);
          modified = true;
        }
      }
    }

    if (modified) {
      tool.zodSchema = fromJSONSchema(schema, {
        defaultTarget: "draft-2020-12",
      });
    }
  }
}
