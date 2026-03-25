import { describe, it, expect, vi } from "vitest";
import { discoverTools, cleanToolName, type DiscoveredTool } from "../discovery.js";
import {
  REPRESENTATIVE_OPENAPI_SPEC, EMPTY_OPENAPI_SPEC, AUTH_ONLY_OPENAPI_SPEC,
  SPEC_WITH_UNCONVERTIBLE_SCHEMA, SPEC_WITH_MISSING_OPERATION_ID,
  SPEC_WITH_PARAM_COLLISION, SPEC_WITH_DELETE, SPEC_WITH_REFS,
} from "./fixtures.js";

function findTool(tools: DiscoveredTool[], name: string): DiscoveredTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found. Available: ${tools.map((t) => t.name).join(", ")}`);
  return tool;
}

describe("cleanToolName", () => {
  it("strips _v1_ suffix from a simple list endpoint", () => {
    expect(cleanToolName("list_entries_v1_entries_get")).toBe("list_entries");
  });
  it("strips _v1_ suffix from a detail endpoint with path params", () => {
    expect(cleanToolName("get_entry_v1_entries__entry_id__get")).toBe("get_entry");
  });
  it("strips _v1_ suffix from a nested path", () => {
    expect(cleanToolName("list_tags_for_entry_v1_extensions_tags__get")).toBe("list_tags_for_entry");
  });
  it("strips _v1_ suffix from a PUT endpoint", () => {
    expect(cleanToolName("set_tags_v1_extensions_tags__entry_id__put")).toBe("set_tags");
  });
  it("strips _v1_ suffix from a search tool", () => {
    expect(cleanToolName("search_entries_v1_tools_search__get")).toBe("search_entries");
  });
  it("strips _v1_ suffix from a create endpoint", () => {
    expect(cleanToolName("create_entry_v1_entries_post")).toBe("create_entry");
  });
  it("strips _v1_ suffix from a delete endpoint", () => {
    expect(cleanToolName("delete_entry_v1_entries__entry_id__delete")).toBe("delete_entry");
  });
  it("returns original string if no _v1_ pattern found", () => {
    expect(cleanToolName("some_custom_operation")).toBe("some_custom_operation");
  });
  it("handles operationId that starts with _v1_", () => {
    const result = cleanToolName("_v1_foo_get");
    expect(typeof result).toBe("string");
  });
});

describe("discoverTools", () => {
  describe("route filtering", () => {
    it("discovers only /v1/ routes, excluding /v1/auth/* and non-/v1/", () => {
      const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
      expect(tools).toHaveLength(6);
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(["create_entry", "get_entry", "list_entries", "list_tags_for_entry", "search_entries", "set_tags"]);
    });
    it("excludes auth login route", () => {
      const names = discoverTools(REPRESENTATIVE_OPENAPI_SPEC).map((t) => t.name);
      expect(names).not.toContain("login");
    });
    it("excludes non-/v1/ routes like /health", () => {
      const names = discoverTools(REPRESENTATIVE_OPENAPI_SPEC).map((t) => t.name);
      expect(names).not.toContain("health");
    });
    it("returns zero tools for empty spec", () => {
      expect(discoverTools(EMPTY_OPENAPI_SPEC)).toEqual([]);
    });
    it("returns zero tools for auth-only spec", () => {
      expect(discoverTools(AUTH_ONLY_OPENAPI_SPEC)).toEqual([]);
    });
  });

  describe("tool name generation", () => {
    it("generates clean tool names", () => {
      const tools = discoverTools(REPRESENTATIVE_OPENAPI_SPEC);
      expect(findTool(tools, "list_entries")).toBeDefined();
      expect(findTool(tools, "create_entry")).toBeDefined();
      expect(findTool(tools, "get_entry")).toBeDefined();
      expect(findTool(tools, "list_tags_for_entry")).toBeDefined();
      expect(findTool(tools, "set_tags")).toBeDefined();
      expect(findTool(tools, "search_entries")).toBeDefined();
    });
    it("does not produce duplicate names", () => {
      const names = discoverTools(REPRESENTATIVE_OPENAPI_SPEC).map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe("HTTP method and path extraction", () => {
    it("extracts GET method", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").httpMethod).toBe("get"); });
    it("extracts POST method", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "create_entry").httpMethod).toBe("post"); });
    it("extracts PUT method", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "set_tags").httpMethod).toBe("put"); });
    it("extracts simple path", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").httpPath).toBe("/v1/entries"); });
    it("extracts path with param", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "get_entry").httpPath).toBe("/v1/entries/{entry_id}"); });
    it("extracts nested path", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "set_tags").httpPath).toBe("/v1/extensions/tags/{entry_id}"); });
  });

  describe("parameter extraction", () => {
    it("extracts query parameters", () => {
      const t = findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries");
      expect(t.queryParams).toContain("limit");
      expect(t.queryParams).toContain("offset");
      expect(t.queryParams).toHaveLength(4);
    });
    it("extracts path parameters", () => {
      const t = findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "get_entry");
      expect(t.pathParams).toContain("entry_id");
      expect(t.pathParams).toHaveLength(1);
    });
    it("extracts path + body for PUT", () => {
      const t = findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "set_tags");
      expect(t.pathParams).toContain("entry_id");
      expect(t.hasBody).toBe(true);
    });
    it("sets hasBody=true for POST with body", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "create_entry").hasBody).toBe(true); });
    it("sets hasBody=false for GET without body", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").hasBody).toBe(false); });
    it("extracts search query params", () => {
      const t = findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "search_entries");
      expect(t.queryParams).toContain("q");
      expect(t.queryParams).toContain("limit");
    });
    it("has no path params for list endpoint", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").pathParams).toEqual([]); });
  });

  describe("auth detection", () => {
    it("detects auth on POST", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "create_entry").requiresAuth).toBe(true); });
    it("detects auth on PUT", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "set_tags").requiresAuth).toBe(true); });
    it("detects no auth on public GET", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").requiresAuth).toBe(false); });
    it("detects no auth on search GET", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "search_entries").requiresAuth).toBe(false); });
  });

  describe("MCP annotations", () => {
    it("sets readOnlyHint=true for GET", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").annotations.readOnlyHint).toBe(true); });
    it("sets readOnlyHint=true for all GETs", () => {
      for (const t of discoverTools(REPRESENTATIVE_OPENAPI_SPEC).filter((t) => t.httpMethod === "get")) {
        expect(t.annotations.readOnlyHint).toBe(true);
      }
    });
    it("does not set readOnlyHint for POST", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "create_entry").annotations.readOnlyHint).not.toBe(true); });
    it("sets destructiveHint for auth'd POST", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "create_entry").annotations.destructiveHint).toBe(true); });
    it("sets destructiveHint for auth'd PUT", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "set_tags").annotations.destructiveHint).toBe(true); });
    it("no destructiveHint for public GET", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").annotations.destructiveHint).not.toBe(true); });
    it("sets destructiveHint for auth'd DELETE", () => { expect(findTool(discoverTools(SPEC_WITH_DELETE), "delete_entry").annotations.destructiveHint).toBe(true); });
    it("sets readOnlyHint for GET alongside DELETE", () => { expect(findTool(discoverTools(SPEC_WITH_DELETE), "get_entry").annotations.readOnlyHint).toBe(true); });
  });

  describe("description extraction", () => {
    it("includes summary", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").description).toContain("List Entries"); });
    it("includes full description", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").description).toContain("paginated"); });
    it("works with summary only", () => { expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_tags_for_entry").description).toContain("List Tags For Entry"); });
  });

  describe("Zod schema generation", () => {
    it("accepts valid query parameters", () => {
      expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "list_entries").zodSchema.safeParse({ limit: 10, offset: 0, status: "active" }).success).toBe(true);
    });
    it("accepts valid path parameters", () => {
      expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "get_entry").zodSchema.safeParse({ entry_id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
    });
    it("accepts merged path + body parameters", () => {
      expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "set_tags").zodSchema.safeParse({ entry_id: "550e8400-e29b-41d4-a716-446655440000", tags: ["a"] }).success).toBe(true);
    });
    it("accepts body parameters for POST", () => {
      expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "create_entry").zodSchema.safeParse({ title: "Test", summary: "A test", entry_type: "assertion" }).success).toBe(true);
    });
    it("requires mandatory fields", () => {
      expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "create_entry").zodSchema.safeParse({ summary: "Missing title" }).success).toBe(false);
    });
    it("requires mandatory query params", () => {
      expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "search_entries").zodSchema.safeParse({ limit: 10 }).success).toBe(false);
    });
    it("requires path param", () => {
      expect(findTool(discoverTools(REPRESENTATIVE_OPENAPI_SPEC), "get_entry").zodSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("skips unconvertible schemas without crashing", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const tools = discoverTools(SPEC_WITH_UNCONVERTIBLE_SCHEMA);
      expect(tools.some((t) => t.name === "list_entries")).toBe(true);
      expect(tools.some((t) => t.name === "broken_endpoint")).toBe(false);
      spy.mockRestore();
    });
    it("logs warning for unconvertible schema", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      discoverTools(SPEC_WITH_UNCONVERTIBLE_SCHEMA);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
    it("skips operations without operationId", () => {
      const tools = discoverTools(SPEC_WITH_MISSING_OPERATION_ID);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("get_entry");
    });
    it("warns on parameter name collisions", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const tools = discoverTools(SPEC_WITH_PARAM_COLLISION);
      expect(tools.length).toBeGreaterThanOrEqual(1);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
    it("handles empty paths", () => { expect(discoverTools(EMPTY_OPENAPI_SPEC)).toEqual([]); });
    it("handles undefined paths", () => {
      expect(discoverTools({ openapi: "3.1.0", info: { title: "Test", version: "0.1.0" } })).toEqual([]);
    });
  });

  describe("$ref resolution", () => {
    it("resolves $ref body schemas from components/schemas", () => {
      const tools = discoverTools(SPEC_WITH_REFS);
      const createEntry = findTool(tools, "create_entry");
      expect(createEntry.hasBody).toBe(true);
      const result = createEntry.zodSchema.safeParse({ title: "Test" });
      expect(result.success).toBe(true);
    });

    it("requires mandatory fields from $ref body schemas", () => {
      const tools = discoverTools(SPEC_WITH_REFS);
      const createEntry = findTool(tools, "create_entry");
      const result = createEntry.zodSchema.safeParse({ summary: "No title" });
      expect(result.success).toBe(false);
    });

    it("merges path params with $ref body schemas", () => {
      const tools = discoverTools(SPEC_WITH_REFS);
      const setTags = findTool(tools, "set_tags");
      expect(setTags.pathParams).toContain("entry_id");
      expect(setTags.hasBody).toBe(true);
      const result = setTags.zodSchema.safeParse({ entry_id: "uuid-val", tags: ["a", "b"] });
      expect(result.success).toBe(true);
    });

    it("detects auth from $ref spec with HTTPBearer security scheme", () => {
      const tools = discoverTools(SPEC_WITH_REFS);
      const createEntry = findTool(tools, "create_entry");
      expect(createEntry.requiresAuth).toBe(true);
    });
  });
});
