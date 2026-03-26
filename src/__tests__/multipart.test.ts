import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverTools, type DiscoveredTool } from "../discovery.js";
import { createToolHandler, type ToolHandler } from "../handler.js";
import type { PhiactaClient } from "../client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient(): PhiactaClient {
  return {
    callApi: vi.fn(),
    login: vi.fn(),
    fetchOpenApiSpec: vi.fn(),
    uploadFile: vi.fn(),
  } as unknown as PhiactaClient;
}

function makeTool(overrides: Partial<DiscoveredTool> = {}): DiscoveredTool {
  return {
    name: "test_tool",
    description: "A test tool",
    zodSchema: {} as any,
    httpMethod: "get",
    httpPath: "/v1/test",
    requiresAuth: false,
    pathParams: [],
    queryParams: [],
    hasBody: false,
    isMultipart: false,
    annotations: {},
    rawJsonSchema: { type: "object" },
    ...overrides,
  };
}

/**
 * OpenAPI spec fragment for a multipart file upload endpoint.
 * Mirrors what FastAPI generates for UploadFile + Form parameters.
 */
const MULTIPART_UPLOAD_SPEC = {
  openapi: "3.1.0",
  info: { title: "Phiacta", version: "0.1.0" },
  paths: {
    "/v1/entries/{entry_id}/files/{path}": {
      put: {
        operationId: "put_entry_file_v1_entries__entry_id__files__path__put",
        summary: "Put Entry File",
        description: "Create or update a file in an entry's repository.",
        security: [{ Bearer: [] }],
        parameters: [
          { name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "path", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["content"],
                properties: {
                  content: { type: "string", format: "binary" },
                  message: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Successful Response" } },
      },
      get: {
        operationId: "get_entry_file_content_v1_entries__entry_id__files__path__get",
        summary: "Get Entry File Content",
        parameters: [
          { name: "entry_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "path", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Successful Response" } },
      },
    },
    "/v1/entries": {
      get: {
        operationId: "list_entries_v1_entries_get",
        summary: "List Entries",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
        ],
        responses: { "200": { description: "Successful Response" } },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Discovery: isMultipart flag detection
// ---------------------------------------------------------------------------

describe("discovery — multipart/form-data detection", () => {
  it("sets isMultipart=true for endpoints with multipart/form-data content type", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const putFile = tools.find((t) => t.name === "put_entry_file");
    expect(putFile).toBeDefined();
    expect(putFile!.isMultipart).toBe(true);
  });

  it("sets isMultipart=false for standard JSON endpoints", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const listEntries = tools.find((t) => t.name === "list_entries");
    expect(listEntries).toBeDefined();
    expect(listEntries!.isMultipart).toBe(false);
  });

  it("extracts path parameters from multipart endpoint", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const putFile = tools.find((t) => t.name === "put_entry_file");
    expect(putFile!.pathParams).toContain("entry_id");
    expect(putFile!.pathParams).toContain("path");
  });

  it("detects auth on multipart endpoint", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const putFile = tools.find((t) => t.name === "put_entry_file");
    expect(putFile!.requiresAuth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Enrichment: content/file_path MCP-only parameters
// ---------------------------------------------------------------------------

describe("enrichment — MCP-only parameters for file upload", () => {
  it("adds 'content' string parameter to multipart upload tool", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const putFile = tools.find((t) => t.name === "put_entry_file");
    expect(putFile).toBeDefined();

    // After enrichment, the tool's schema should accept a 'content' string
    // (MCP sends text, handler encodes to bytes)
    const result = putFile!.zodSchema.safeParse({
      entry_id: "550e8400-e29b-41d4-a716-446655440000",
      path: "README.md",
      content: "# Hello World",
    });
    expect(result.success).toBe(true);
  });

  it("adds 'file_path' string parameter to multipart upload tool", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const putFile = tools.find((t) => t.name === "put_entry_file");
    expect(putFile).toBeDefined();

    // After enrichment, the tool's schema should accept a 'file_path' string
    const result = putFile!.zodSchema.safeParse({
      entry_id: "550e8400-e29b-41d4-a716-446655440000",
      path: "README.md",
      file_path: "/tmp/test.md",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional 'message' parameter alongside content", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const putFile = tools.find((t) => t.name === "put_entry_file");

    const result = putFile!.zodSchema.safeParse({
      entry_id: "550e8400-e29b-41d4-a716-446655440000",
      path: "data.csv",
      content: "a,b,c",
      message: "Add data",
    });
    expect(result.success).toBe(true);
  });

  it("requires at least entry_id and path for the upload tool", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const putFile = tools.find((t) => t.name === "put_entry_file");

    // Missing path and entry_id should fail
    const result = putFile!.zodSchema.safeParse({
      content: "hello",
    });
    expect(result.success).toBe(false);
  });

  it("does not add content/file_path to non-multipart tools", () => {
    const tools = discoverTools(MULTIPART_UPLOAD_SPEC);
    const listEntries = tools.find((t) => t.name === "list_entries");
    expect(listEntries).toBeDefined();

    // list_entries should NOT have content or file_path parameters
    const schema = listEntries!.rawJsonSchema;
    const props = schema.properties ?? {};
    expect(props).not.toHaveProperty("content");
    expect(props).not.toHaveProperty("file_path");
  });
});

// ---------------------------------------------------------------------------
// Handler: multipart form-data construction and input validation
// ---------------------------------------------------------------------------

describe("handler — multipart upload tool", () => {
  let mockClient: PhiactaClient;
  beforeEach(() => { mockClient = createMockClient(); });

  it("calls uploadFile for multipart tools when 'content' string is provided", async () => {
    const handler = createToolHandler(
      makeTool({
        name: "put_entry_file",
        httpMethod: "put",
        httpPath: "/v1/entries/{entry_id}/files/{path}",
        pathParams: ["entry_id", "path"],
        hasBody: true,
        isMultipart: true,
        requiresAuth: true,
      }),
      mockClient
    );
    (mockClient.uploadFile as any).mockResolvedValueOnce({ sha: "abc123" });

    const result = await handler({
      entry_id: "uuid-1",
      path: "README.md",
      content: "# Hello",
      message: "Add readme",
    });

    expect(mockClient.uploadFile).toHaveBeenCalledTimes(1);
    const [url, fileBytes, message] = (mockClient.uploadFile as any).mock.calls[0];
    expect(url).toBe("/v1/entries/uuid-1/files/README.md");
    // Content string should be UTF-8 encoded to bytes
    expect(fileBytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(fileBytes)).toBe("# Hello");
    expect(message).toBe("Add readme");
  });

  it("calls uploadFile for multipart tools when 'file_path' is provided", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");

    // Create a real temp file in cwd
    const tempFile = path.join(process.cwd(), "_test_upload.bin");
    const fileContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
    await fs.writeFile(tempFile, fileContent);

    try {
      const handler = createToolHandler(
        makeTool({
          name: "put_entry_file",
          httpMethod: "put",
          httpPath: "/v1/entries/{entry_id}/files/{path}",
          pathParams: ["entry_id", "path"],
          hasBody: true,
          isMultipart: true,
          requiresAuth: true,
        }),
        mockClient
      );
      (mockClient.uploadFile as any).mockResolvedValueOnce({ sha: "def456" });

      const result = await handler({
        entry_id: "uuid-2",
        path: "figures/image.png",
        file_path: tempFile,
      });

      expect(mockClient.uploadFile).toHaveBeenCalledTimes(1);
      const [url, bytes] = (mockClient.uploadFile as any).mock.calls[0];
      expect(url).toBe("/v1/entries/uuid-2/files/figures%2Fimage.png");
      expect(new Uint8Array(bytes)).toEqual(fileContent);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  });

  it("rejects when both content and file_path are provided", async () => {
    const handler = createToolHandler(
      makeTool({
        name: "put_entry_file",
        httpMethod: "put",
        httpPath: "/v1/entries/{entry_id}/files/{path}",
        pathParams: ["entry_id", "path"],
        hasBody: true,
        isMultipart: true,
        requiresAuth: true,
      }),
      mockClient
    );

    const result = await handler({
      entry_id: "uuid-1",
      path: "README.md",
      content: "hello",
      file_path: "/tmp/file.md",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("content");
    expect(result.content[0].text).toContain("file_path");
  });

  it("rejects when neither content nor file_path is provided", async () => {
    const handler = createToolHandler(
      makeTool({
        name: "put_entry_file",
        httpMethod: "put",
        httpPath: "/v1/entries/{entry_id}/files/{path}",
        pathParams: ["entry_id", "path"],
        hasBody: true,
        isMultipart: true,
        requiresAuth: true,
      }),
      mockClient
    );

    const result = await handler({
      entry_id: "uuid-1",
      path: "README.md",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("content");
  });

  it("accepts file_path outside current working directory", async () => {
    const fs = await import("fs/promises");
    const os = await import("os");
    const pathMod = await import("path");

    // Create a temp file outside cwd
    const tempDir = os.tmpdir();
    const tempFile = pathMod.join(tempDir, "_phi121_test_outside_cwd.txt");
    await fs.writeFile(tempFile, "content from outside cwd");

    try {
      const handler = createToolHandler(
        makeTool({
          name: "put_entry_file",
          httpMethod: "put",
          httpPath: "/v1/entries/{entry_id}/files/{path}",
          pathParams: ["entry_id", "path"],
          hasBody: true,
          isMultipart: true,
          requiresAuth: true,
        }),
        mockClient
      );
      (mockClient.uploadFile as any).mockResolvedValueOnce({ sha: "outside" });

      const result = await handler({
        entry_id: "uuid-1",
        path: "README.md",
        file_path: tempFile,
      });

      expect(result.isError).toBeUndefined();
      expect(mockClient.uploadFile).toHaveBeenCalledTimes(1);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  });

  it("rejects file_path pointing to a non-existent file", async () => {
    const handler = createToolHandler(
      makeTool({
        name: "put_entry_file",
        httpMethod: "put",
        httpPath: "/v1/entries/{entry_id}/files/{path}",
        pathParams: ["entry_id", "path"],
        hasBody: true,
        isMultipart: true,
        requiresAuth: true,
      }),
      mockClient
    );

    const result = await handler({
      entry_id: "uuid-1",
      path: "README.md",
      file_path: "./nonexistent_file_that_does_not_exist.txt",
    });

    expect(result.isError).toBe(true);
  });

  it("rejects file_path pointing to a directory", async () => {
    const handler = createToolHandler(
      makeTool({
        name: "put_entry_file",
        httpMethod: "put",
        httpPath: "/v1/entries/{entry_id}/files/{path}",
        pathParams: ["entry_id", "path"],
        hasBody: true,
        isMultipart: true,
        requiresAuth: true,
      }),
      mockClient
    );

    const result = await handler({
      entry_id: "uuid-1",
      path: "README.md",
      file_path: ".",
    });

    expect(result.isError).toBe(true);
  });

  it("does NOT call uploadFile for non-multipart tools", async () => {
    const handler = createToolHandler(
      makeTool({
        httpMethod: "post",
        httpPath: "/v1/entries",
        hasBody: true,
        isMultipart: false,
      }),
      mockClient
    );
    (mockClient.callApi as any).mockResolvedValueOnce({ id: "new" });

    await handler({ title: "Test" });

    expect(mockClient.uploadFile).not.toHaveBeenCalled();
    expect(mockClient.callApi).toHaveBeenCalledTimes(1);
  });

  it("returns formatted result from uploadFile response", async () => {
    const handler = createToolHandler(
      makeTool({
        name: "put_entry_file",
        httpMethod: "put",
        httpPath: "/v1/entries/{entry_id}/files/{path}",
        pathParams: ["entry_id", "path"],
        hasBody: true,
        isMultipart: true,
        requiresAuth: true,
      }),
      mockClient
    );
    (mockClient.uploadFile as any).mockResolvedValueOnce({ sha: "abc123" });

    const result = await handler({
      entry_id: "uuid-1",
      path: "README.md",
      content: "hello",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.sha).toBe("abc123");
  });

  it("passes message=undefined when no message is provided to uploadFile", async () => {
    const handler = createToolHandler(
      makeTool({
        name: "put_entry_file",
        httpMethod: "put",
        httpPath: "/v1/entries/{entry_id}/files/{path}",
        pathParams: ["entry_id", "path"],
        hasBody: true,
        isMultipart: true,
        requiresAuth: true,
      }),
      mockClient
    );
    (mockClient.uploadFile as any).mockResolvedValueOnce({ sha: "sha" });

    await handler({
      entry_id: "uuid-1",
      path: "file.txt",
      content: "text",
    });

    const [, , message] = (mockClient.uploadFile as any).mock.calls[0];
    expect(message).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Client: uploadFile sends multipart FormData
// ---------------------------------------------------------------------------

describe("client — uploadFile method", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  const BASE_URL = "http://localhost:8000";

  function jsonResponse(body: any, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("sends a multipart/form-data request with file content", async () => {
    // Import the real client to test uploadFile
    const { PhiactaClient } = await import("../client.js");

    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
    const client = new PhiactaClient(BASE_URL);
    await client.login("user", "pass");

    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: "abc123" }));
    const content = new TextEncoder().encode("# Hello World");
    await (client as any).uploadFile(
      "/v1/entries/uuid-1/files/README.md",
      content,
      "Add readme"
    );

    const [url, opts] = mockFetch.mock.calls[1];
    expect(url).toContain("/v1/entries/uuid-1/files/README.md");
    expect(opts.method).toBe("PUT");
    // Body should be FormData, not JSON
    expect(opts.body).toBeInstanceOf(FormData);
    // Should NOT have Content-Type header (browser/fetch sets it with boundary)
    expect(opts.headers?.["Content-Type"]).toBeUndefined();
    // Should have Authorization header
    expect(opts.headers?.["Authorization"]).toBe("Bearer jwt");
  });

  it("includes file content as 'content' field in FormData", async () => {
    const { PhiactaClient } = await import("../client.js");

    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
    const client = new PhiactaClient(BASE_URL);
    await client.login("user", "pass");

    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: "abc" }));
    const content = new TextEncoder().encode("file bytes");
    await (client as any).uploadFile("/v1/entries/uuid/files/f.txt", content);

    const formData: FormData = mockFetch.mock.calls[1][1].body;
    expect(formData.has("content")).toBe(true);
  });

  it("includes message as form field when provided", async () => {
    const { PhiactaClient } = await import("../client.js");

    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
    const client = new PhiactaClient(BASE_URL);
    await client.login("user", "pass");

    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: "abc" }));
    const content = new TextEncoder().encode("data");
    await (client as any).uploadFile("/v1/entries/uuid/files/f.txt", content, "My message");

    const formData: FormData = mockFetch.mock.calls[1][1].body;
    expect(formData.get("message")).toBe("My message");
  });

  it("omits message field from FormData when not provided", async () => {
    const { PhiactaClient } = await import("../client.js");

    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
    const client = new PhiactaClient(BASE_URL);
    await client.login("user", "pass");

    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: "abc" }));
    const content = new TextEncoder().encode("data");
    await (client as any).uploadFile("/v1/entries/uuid/files/f.txt", content);

    const formData: FormData = mockFetch.mock.calls[1][1].body;
    expect(formData.has("message")).toBe(false);
  });

  it("throws on non-OK response from uploadFile", async () => {
    const { PhiactaClient } = await import("../client.js");

    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
    const client = new PhiactaClient(BASE_URL);
    await client.login("user", "pass");

    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Not found" }, 404));
    const content = new TextEncoder().encode("data");

    await expect(
      (client as any).uploadFile("/v1/entries/uuid/files/f.txt", content)
    ).rejects.toThrow(/404/);
  });
});
