import { describe, it, expect, vi, beforeEach } from "vitest";
import { createToolHandler } from "../handler.js";
import type { DiscoveredTool } from "../discovery.js";
import type { PhiactaClient } from "../client.js";

function createMockClient(): PhiactaClient {
  return { callApi: vi.fn(), login: vi.fn(), fetchOpenApiSpec: vi.fn() } as unknown as PhiactaClient;
}

function makeTool(overrides: Partial<DiscoveredTool> = {}): DiscoveredTool {
  return { name: "test_tool", description: "A test tool", zodSchema: {} as any, httpMethod: "get", httpPath: "/v1/test", requiresAuth: false, pathParams: [], queryParams: [], hasBody: false, annotations: {}, rawJsonSchema: { type: "object" }, ...overrides };
}

describe("createToolHandler", () => {
  let mockClient: PhiactaClient;
  beforeEach(() => { mockClient = createMockClient(); });

  describe("path parameter interpolation", () => {
    it("interpolates path parameters into URL", async () => {
      const handler = createToolHandler(makeTool({ httpPath: "/v1/entries/{entry_id}", pathParams: ["entry_id"] }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({ id: "abc-123" });
      await handler({ entry_id: "abc-123" });
      const [method, path] = (mockClient.callApi as any).mock.calls[0];
      expect(method).toBe("get");
      expect(path).toBe("/v1/entries/abc-123");
    });
    it("interpolates multiple path parameters", async () => {
      const handler = createToolHandler(makeTool({ httpPath: "/v1/entries/{entry_id}/files/{file_path}", pathParams: ["entry_id", "file_path"] }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({});
      await handler({ entry_id: "uuid-1", file_path: "README.md" });
      const [method, path] = (mockClient.callApi as any).mock.calls[0];
      expect(method).toBe("get");
      expect(path).toBe("/v1/entries/uuid-1/files/README.md");
    });
    it("does not include path params in query params", async () => {
      const handler = createToolHandler(makeTool({ httpPath: "/v1/entries/{entry_id}", pathParams: ["entry_id"], queryParams: [] }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({});
      await handler({ entry_id: "uuid-1" });
      const queryParams = (mockClient.callApi as any).mock.calls[0][2];
      if (queryParams) expect(queryParams).not.toHaveProperty("entry_id");
    });
  });

  describe("query parameter separation", () => {
    it("passes query parameters to callApi", async () => {
      const handler = createToolHandler(makeTool({ queryParams: ["limit", "offset", "status"] }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({ items: [] });
      await handler({ limit: 10, offset: 20, status: "active" });
      expect((mockClient.callApi as any).mock.calls[0][2]).toEqual(expect.objectContaining({ limit: 10, offset: 20, status: "active" }));
    });
    it("does not include query params in body", async () => {
      const handler = createToolHandler(makeTool({ httpMethod: "post", queryParams: ["format"], hasBody: true }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({});
      await handler({ format: "json", title: "Test" });
      const body = (mockClient.callApi as any).mock.calls[0][3];
      if (body) expect(body).not.toHaveProperty("format");
    });
  });

  describe("body parameter separation", () => {
    it("sends remaining params as body for POST", async () => {
      const handler = createToolHandler(makeTool({ httpMethod: "post", hasBody: true }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({ id: "new" });
      await handler({ title: "Test Entry", summary: "A summary" });
      expect((mockClient.callApi as any).mock.calls[0][3]).toEqual(expect.objectContaining({ title: "Test Entry", summary: "A summary" }));
    });
    it("separates path params from body for PUT", async () => {
      const handler = createToolHandler(makeTool({ httpMethod: "put", httpPath: "/v1/extensions/tags/{entry_id}", pathParams: ["entry_id"], queryParams: [], hasBody: true }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({});
      await handler({ entry_id: "uuid-123", tags: ["philosophy"] });
      const [, path, , body] = (mockClient.callApi as any).mock.calls[0];
      expect(path).toBe("/v1/extensions/tags/uuid-123");
      expect(body).toEqual(expect.objectContaining({ tags: ["philosophy"] }));
      expect(body).not.toHaveProperty("entry_id");
    });
    it("does not send body for GET", async () => {
      const handler = createToolHandler(makeTool({ httpMethod: "get", queryParams: ["q"], hasBody: false }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({ results: [] });
      await handler({ q: "search term" });
      expect((mockClient.callApi as any).mock.calls[0][3]).toBeUndefined();
    });
  });

  describe("auth flag", () => {
    it("passes auth=true for authenticated operations", async () => {
      const handler = createToolHandler(makeTool({ requiresAuth: true }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({});
      await handler({});
      expect((mockClient.callApi as any).mock.calls[0][4]).toBe(true);
    });
    it("passes auth=false for public operations", async () => {
      const handler = createToolHandler(makeTool({ requiresAuth: false }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({});
      await handler({});
      expect((mockClient.callApi as any).mock.calls[0][4]).toBe(false);
    });
  });

  describe("response formatting", () => {
    it("returns JSON as pretty-printed MCP text content", async () => {
      const handler = createToolHandler(makeTool(), mockClient);
      const data = { id: "abc", title: "Test" };
      (mockClient.callApi as any).mockResolvedValueOnce(data);
      expect(await handler({})).toEqual({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
    });
    it("returns string result as text content", async () => {
      const handler = createToolHandler(makeTool(), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce("This is plain text");
      expect(await handler({})).toEqual({ content: [{ type: "text", text: "This is plain text" }] });
    });
    it("returns empty object as JSON", async () => {
      const handler = createToolHandler(makeTool(), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({});
      const result = await handler({});
      expect(JSON.parse(result.content[0].text)).toEqual({});
    });
    it("returns array as JSON", async () => {
      const handler = createToolHandler(makeTool(), mockClient);
      const items = [{ id: "1" }, { id: "2" }];
      (mockClient.callApi as any).mockResolvedValueOnce(items);
      expect(JSON.parse((await handler({})).content[0].text)).toEqual(items);
    });
  });

  describe("complete parameter routing", () => {
    it("correctly routes path, query, and body params", async () => {
      const handler = createToolHandler(makeTool({ httpMethod: "put", httpPath: "/v1/entries/{entry_id}", pathParams: ["entry_id"], queryParams: ["format"], hasBody: true, requiresAuth: true }), mockClient);
      (mockClient.callApi as any).mockResolvedValueOnce({ updated: true });
      await handler({ entry_id: "uuid-1", format: "json", title: "Updated", summary: "New" });
      const [method, path, params, body, auth] = (mockClient.callApi as any).mock.calls[0];
      expect(method).toBe("put");
      expect(path).toBe("/v1/entries/uuid-1");
      expect(params).toEqual(expect.objectContaining({ format: "json" }));
      expect(params).not.toHaveProperty("entry_id");
      expect(body).toEqual(expect.objectContaining({ title: "Updated", summary: "New" }));
      expect(body).not.toHaveProperty("entry_id");
      expect(body).not.toHaveProperty("format");
      expect(auth).toBe(true);
    });
  });
});
