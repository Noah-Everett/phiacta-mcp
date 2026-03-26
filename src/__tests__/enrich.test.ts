import { describe, it, expect } from "vitest";
import { discoverTools } from "../discovery.js";
import { enrichToolsWithPlugins } from "../enrich.js";
import { REPRESENTATIVE_OPENAPI_SPEC, REPRESENTATIVE_PLUGINS } from "./fixtures.js";
import type { PluginInfo } from "../client.js";

function findTool(tools: ReturnType<typeof discoverTools>, name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

describe("enrichToolsWithPlugins", () => {
  it("injects writable extension fields into create_entry schema", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    enrichToolsWithPlugins(tools, REPRESENTATIVE_PLUGINS);
    const createEntry = findTool(tools, "create_entry");

    // Should accept all extension fields in a single call
    const result = createEntry.zodSchema.safeParse({
      title: "Euler's Identity",
      entry_type: "theorem",
      summary: "Relates five constants",
      tags: ["math"],
      content: "e^{i\\pi} + 1 = 0",
    });
    expect(result.success).toBe(true);
  });

  it("makes required_on_create fields required on create_entry", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    enrichToolsWithPlugins(tools, REPRESENTATIVE_PLUGINS);
    const createEntry = findTool(tools, "create_entry");

    // Missing title (required_on_create from metadata plugin)
    const result = createEntry.zodSchema.safeParse({ summary: "No title" });
    expect(result.success).toBe(false);
  });

  it("does NOT make required_on_create fields required on update_entry", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    enrichToolsWithPlugins(tools, REPRESENTATIVE_PLUGINS);
    const updateEntry = findTool(tools, "update_entry");

    // title is not required on update — only on create
    const result = updateEntry.zodSchema.safeParse({
      entry_id: "550e8400-e29b-41d4-a716-446655440000",
      summary: "Updated summary",
    });
    expect(result.success).toBe(true);
  });

  it("injects writable extension fields into update_entry schema", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    enrichToolsWithPlugins(tools, REPRESENTATIVE_PLUGINS);
    const updateEntry = findTool(tools, "update_entry");

    const result = updateEntry.zodSchema.safeParse({
      entry_id: "550e8400-e29b-41d4-a716-446655440000",
      title: "New Title",
      tags: ["updated"],
      entry_type: "definition",
    });
    expect(result.success).toBe(true);
  });

  it("does not overwrite existing body properties", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    enrichToolsWithPlugins(tools, REPRESENTATIVE_PLUGINS);
    const createEntry = findTool(tools, "create_entry");

    // content and content_format should still work as before
    const result = createEntry.zodSchema.safeParse({
      title: "Test",
      content: "Some content",
      content_format: "markdown",
    });
    expect(result.success).toBe(true);
  });

  it("is a no-op with empty plugins", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    const beforeSchema = findTool(tools, "create_entry").rawJsonSchema;
    const propCountBefore = Object.keys(beforeSchema.properties ?? {}).length;

    enrichToolsWithPlugins(tools, []);

    const afterSchema = findTool(tools, "create_entry").rawJsonSchema;
    const propCountAfter = Object.keys(afterSchema.properties ?? {}).length;
    expect(propCountAfter).toBe(propCountBefore);
  });

  it("is a no-op with plugins that have no providers", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    const noProviderPlugins: PluginInfo[] = [
      { name: "search", type: "tool", version: "1.0.0", description: "Search", depends_on: [], provider: null },
    ];
    const propCountBefore = Object.keys(findTool(tools, "create_entry").rawJsonSchema.properties ?? {}).length;

    enrichToolsWithPlugins(tools, noProviderPlugins);

    const propCountAfter = Object.keys(findTool(tools, "create_entry").rawJsonSchema.properties ?? {}).length;
    expect(propCountAfter).toBe(propCountBefore);
  });

  it("does not modify non-target tools", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    const searchBefore = JSON.stringify(findTool(tools, "search_entries").rawJsonSchema);

    enrichToolsWithPlugins(tools, REPRESENTATIVE_PLUGINS);

    const searchAfter = JSON.stringify(findTool(tools, "search_entries").rawJsonSchema);
    expect(searchAfter).toBe(searchBefore);
  });

  it("falls back to string schema for fields not found in other tools", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    const unknownPlugin: PluginInfo[] = [
      {
        name: "mystery",
        type: "extension",
        version: "1.0.0",
        description: "Unknown extension",
        depends_on: [],
        provider: {
          fields: ["mystery_field"],
          writable_fields: ["mystery_field"],
          required_on_create: [],
          include_in_list: true,
          include_in_detail: true,
        },
      },
    ];

    enrichToolsWithPlugins(tools, unknownPlugin);

    const createEntry = findTool(tools, "create_entry");
    // Should accept a string for the unknown field
    const result = createEntry.zodSchema.safeParse({ mystery_field: "hello" });
    expect(result.success).toBe(true);
  });

  it("mines tags array schema from set_tags tool", () => {
    const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
    enrichToolsWithPlugins(tools, REPRESENTATIVE_PLUGINS);
    const createEntry = findTool(tools, "create_entry");

    // tags should accept an array (mined from set_tags schema)
    const result = createEntry.zodSchema.safeParse({
      title: "Test",
      tags: ["a", "b", "c"],
    });
    expect(result.success).toBe(true);
  });
});
