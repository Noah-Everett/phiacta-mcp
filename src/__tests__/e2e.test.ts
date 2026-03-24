import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PhiactaClient } from "../client.js";
import { discoverTools } from "../discovery.js";
import { createToolHandler } from "../handler.js";
import { registerDiscoveredTools } from "../register.js";
import { REPRESENTATIVE_OPENAPI_SPEC } from "./fixtures.js";

const mockFetch = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", mockFetch); mockFetch.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("E2E: Startup and tool registration", () => {
  it("discovers and registers all tools from OpenAPI spec", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    const spec = await client.fetchOpenApiSpec();
    const tools = discoverTools(spec);
    const server = new McpServer({ name: "phiacta-mcp", version: "0.1.0" });
    registerDiscoveredTools(server, tools, client);
    expect(tools).toHaveLength(6);
    expect(tools.map((t) => t.name).sort()).toEqual(["create_entry", "get_entry", "list_entries", "list_tags_for_entry", "search_entries", "set_tags"]);
  });

  it("logs in before fetching spec when credentials provided", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    await client.login("testuser", "testpass");
    const tools = discoverTools(await client.fetchOpenApiSpec());
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("/v1/auth/login");
    expect(tools.length).toBe(6);
  });

  it("fails when backend is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(new PhiactaClient("http://localhost:8000").fetchOpenApiSpec()).rejects.toThrow();
  });

  it("registers zero tools for non-qualifying paths", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ openapi: "3.1.0", info: { title: "Phiacta", version: "0.1.0" }, paths: { "/health": { get: { operationId: "health_health_get", summary: "Health", responses: { "200": { description: "OK" } } } } } }));
    const tools = discoverTools(await new PhiactaClient("http://localhost:8000").fetchOpenApiSpec());
    expect(tools).toHaveLength(0);
  });
});

describe("E2E: Tool execution through handler", () => {
  it("executes list_entries with query params", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    const tools = discoverTools(await client.fetchOpenApiSpec());
    const handler = createToolHandler(tools.find((t) => t.name === "list_entries")!, client);
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: "1", title: "First" }], total: 1 }));
    const result = await handler({ limit: 10, status: "active" });
    const [url, opts] = mockFetch.mock.calls[1];
    expect(new URL(url).pathname).toBe("/v1/entries");
    expect(new URL(url).searchParams.get("limit")).toBe("10");
    expect(opts.method).toBe("GET");
    expect(JSON.parse(result.content[0].text).items[0].title).toBe("First");
  });

  it("executes get_entry with path param interpolation", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    const tools = discoverTools(await client.fetchOpenApiSpec());
    const handler = createToolHandler(tools.find((t) => t.name === "get_entry")!, client);
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "uuid-1", title: "Philosophy" }));
    const result = await handler({ entry_id: "uuid-1" });
    expect(mockFetch.mock.calls[1][0]).toContain("/v1/entries/uuid-1");
    expect(mockFetch.mock.calls[1][0]).not.toContain("{entry_id}");
    expect(JSON.parse(result.content[0].text).title).toBe("Philosophy");
  });

  it("executes create_entry with auth and body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    await client.login("u", "p");
    const tools = discoverTools(await client.fetchOpenApiSpec());
    const handler = createToolHandler(tools.find((t) => t.name === "create_entry")!, client);
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-id", title: "Epistemology" }));
    const result = await handler({ title: "Epistemology", summary: "Intro" });
    const [url, opts] = mockFetch.mock.calls[2];
    expect(url).toContain("/v1/entries");
    expect(opts.method).toBe("POST");
    expect(opts.headers?.["Authorization"]).toBe("Bearer jwt");
    expect(JSON.parse(opts.body).title).toBe("Epistemology");
    expect(JSON.parse(result.content[0].text).id).toBe("new-id");
  });

  it("executes set_tags with path param, body, and auth", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "tok" }));
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    await client.login("u", "p");
    const tools = discoverTools(await client.fetchOpenApiSpec());
    const handler = createToolHandler(tools.find((t) => t.name === "set_tags")!, client);
    mockFetch.mockResolvedValueOnce(jsonResponse({ tags: ["ethics"] }));
    await handler({ entry_id: "uuid-for-tags", tags: ["ethics"] });
    const [url, opts] = mockFetch.mock.calls[2];
    expect(url).toContain("/v1/extensions/tags/uuid-for-tags");
    expect(opts.method).toBe("PUT");
    const body = JSON.parse(opts.body);
    expect(body.tags).toEqual(["ethics"]);
    expect(body.entry_id).toBeUndefined();
  });

  it("executes search_entries with required query param", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    const tools = discoverTools(await client.fetchOpenApiSpec());
    const handler = createToolHandler(tools.find((t) => t.name === "search_entries")!, client);
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: "1", title: "Match" }] }));
    const result = await handler({ q: "epistemology", limit: 5 });
    const url = new URL(mockFetch.mock.calls[1][0]);
    expect(url.searchParams.get("q")).toBe("epistemology");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(JSON.parse(result.content[0].text).items[0].title).toBe("Match");
  });
});

describe("E2E: Error handling", () => {
  it("handles 401 with re-auth retry", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "old" }));
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    await client.login("u", "p");
    const tools = discoverTools(await client.fetchOpenApiSpec());
    const handler = createToolHandler(tools.find((t) => t.name === "create_entry")!, client);
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "new" }))
      .mockResolvedValueOnce(jsonResponse({ id: "created", title: "Test" }));
    expect(JSON.parse((await handler({ title: "Test" })).content[0].text).id).toBe("created");
  });

  it("handles non-JSON response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const client = new PhiactaClient("http://localhost:8000");
    const tools = discoverTools(await client.fetchOpenApiSpec());
    const handler = createToolHandler(tools.find((t) => t.name === "get_entry")!, client);
    mockFetch.mockResolvedValueOnce(new Response("# Markdown\n\nHello", { status: 200, headers: { "Content-Type": "text/markdown" } }));
    const result = await handler({ entry_id: "uuid-1" });
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Markdown");
  });
});

describe("E2E: Schema validation", () => {
  it("rejects invalid input", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const tools = discoverTools(await new PhiactaClient("http://localhost:8000").fetchOpenApiSpec());
    expect(tools.find((t) => t.name === "create_entry")!.zodSchema.safeParse({ summary: "No title" }).success).toBe(false);
  });
  it("accepts valid input", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const tools = discoverTools(await new PhiactaClient("http://localhost:8000").fetchOpenApiSpec());
    expect(tools.find((t) => t.name === "list_entries")!.zodSchema.safeParse({ limit: 25 }).success).toBe(true);
  });
  it("search requires q", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const tools = discoverTools(await new PhiactaClient("http://localhost:8000").fetchOpenApiSpec());
    const s = tools.find((t) => t.name === "search_entries")!;
    expect(s.zodSchema.safeParse({ limit: 10 }).success).toBe(false);
    expect(s.zodSchema.safeParse({ q: "test" }).success).toBe(true);
  });
  it("set_tags requires entry_id and tags", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const tools = discoverTools(await new PhiactaClient("http://localhost:8000").fetchOpenApiSpec());
    const s = tools.find((t) => t.name === "set_tags")!;
    expect(s.zodSchema.safeParse({ entry_id: "uuid" }).success).toBe(false);
    expect(s.zodSchema.safeParse({ tags: ["a"] }).success).toBe(false);
    expect(s.zodSchema.safeParse({ entry_id: "uuid", tags: ["a"] }).success).toBe(true);
  });
  it("get_entry requires entry_id", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(REPRESENTATIVE_OPENAPI_SPEC));
    const tools = discoverTools(await new PhiactaClient("http://localhost:8000").fetchOpenApiSpec());
    const s = tools.find((t) => t.name === "get_entry")!;
    expect(s.zodSchema.safeParse({}).success).toBe(false);
    expect(s.zodSchema.safeParse({ entry_id: "uuid" }).success).toBe(true);
  });
});
