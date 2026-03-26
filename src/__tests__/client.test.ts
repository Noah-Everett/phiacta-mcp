import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PhiactaClient } from "../client.js";

const mockFetch = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", mockFetch); mockFetch.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function textResponse(body: string, status = 200, ct = "text/plain"): Response {
  return new Response(body, { status, headers: { "Content-Type": ct } });
}

const BASE_URL = "http://localhost:8000";

describe("PhiactaClient", () => {
  describe("constructor", () => {
    it("creates a client", () => { expect(new PhiactaClient(BASE_URL)).toBeDefined(); });
  });

  describe("login", () => {
    it("sends POST to /v1/auth/login", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt-123" }));
      await new PhiactaClient(BASE_URL).login("user", "pass");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/v1/auth/login`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({ handle: "user", password: "pass" });
    });
    it("stores JWT for subsequent auth requests", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt-456" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("user", "pass");
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));
      await client.callApi("GET", "/v1/entries", undefined, undefined, true);
      expect(mockFetch.mock.calls[1][1].headers?.["Authorization"]).toBe("Bearer jwt-456");
    });
    it("stores credentials for re-auth on 401", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "initial" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("retryuser", "retrypass");
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Unauthorized" }, 401))
        .mockResolvedValueOnce(jsonResponse({ access_token: "refreshed" }))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));
      await client.callApi("GET", "/v1/entries", undefined, undefined, true);
      expect(JSON.parse(mockFetch.mock.calls[2][1].body).handle).toBe("retryuser");
    });
    it("throws on login failure", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Invalid" }, 401));
      await expect(new PhiactaClient(BASE_URL).login("bad", "creds")).rejects.toThrow();
    });
  });

  describe("fetchOpenApiSpec", () => {
    it("fetches GET /openapi.json", async () => {
      const spec = { openapi: "3.1.0", paths: {} };
      mockFetch.mockResolvedValueOnce(jsonResponse(spec));
      const result = await new PhiactaClient(BASE_URL).fetchOpenApiSpec();
      expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/openapi.json`);
      expect(result).toEqual(spec);
    });
    it("does not include /v1 prefix", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ openapi: "3.1.0" }));
      await new PhiactaClient(BASE_URL).fetchOpenApiSpec();
      expect(mockFetch.mock.calls[0][0]).not.toContain("/v1/openapi.json");
    });
    it("does not send Authorization header", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "tok" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("u", "p");
      mockFetch.mockResolvedValueOnce(jsonResponse({ openapi: "3.1.0", paths: {} }));
      await client.fetchOpenApiSpec();
      const authHeader = mockFetch.mock.calls[1][1]?.headers?.["Authorization"];
      expect(authHeader === undefined || authHeader === null).toBe(true);
    });
    it("throws when backend is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      await expect(new PhiactaClient(BASE_URL).fetchOpenApiSpec()).rejects.toThrow();
    });
  });

  describe("callApi — URL construction", () => {
    it("constructs URL from base + path", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries");
      expect(mockFetch.mock.calls[0][0]).toContain(`${BASE_URL}/v1/entries`);
    });
    it("appends query params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries", { limit: 10, offset: 5 });
      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("limit")).toBe("10");
      expect(url.searchParams.get("offset")).toBe("5");
    });
    it("skips undefined query params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries", { limit: 10, offset: undefined });
      expect(new URL(mockFetch.mock.calls[0][0]).searchParams.has("offset")).toBe(false);
    });
    it("skips null query params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries", { limit: 10, status: null });
      expect(new URL(mockFetch.mock.calls[0][0]).searchParams.has("status")).toBe(false);
    });
    it("skips empty string query params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries", { limit: 10, status: "" });
      expect(new URL(mockFetch.mock.calls[0][0]).searchParams.has("status")).toBe(false);
    });
  });

  describe("callApi — headers and body", () => {
    it("sets Authorization when auth=true and token exists", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("u", "p");
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.callApi("POST", "/v1/entries", undefined, { title: "Test" }, true);
      expect(mockFetch.mock.calls[1][1].headers?.["Authorization"]).toBe("Bearer jwt");
    });
    it("no Authorization when auth=false", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries", undefined, undefined, false);
      expect(mockFetch.mock.calls[0][1].headers?.["Authorization"]).toBeUndefined();
    });
    it("no Authorization when no token", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries", undefined, undefined, true);
      const auth = mockFetch.mock.calls[0][1].headers?.["Authorization"];
      expect(auth === undefined || auth === null || auth === "").toBe(true);
    });
    it("sets Content-Type when body provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("POST", "/v1/entries", undefined, { title: "Hi" });
      expect(mockFetch.mock.calls[0][1].headers?.["Content-Type"]).toBe("application/json");
    });
    it("sends body as JSON string", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      const body = { title: "My Entry" };
      await new PhiactaClient(BASE_URL).callApi("POST", "/v1/entries", undefined, body);
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(body);
    });
    it("uses correct HTTP method", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await new PhiactaClient(BASE_URL).callApi("PUT", "/v1/tags/123", undefined, { tags: [] });
      expect(mockFetch.mock.calls[0][1].method).toBe("PUT");
    });
  });

  describe("callApi — response handling", () => {
    it("parses JSON response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "abc" }));
      expect(await new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries/abc")).toEqual({ id: "abc" });
    });
    it("returns raw text for non-JSON", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("Hello plain text"));
      expect(await new PhiactaClient(BASE_URL).callApi("GET", "/v1/files/readme")).toBe("Hello plain text");
    });
    it("returns text for binary-like response", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("binary-ish", 200, "application/octet-stream"));
      expect(typeof await new PhiactaClient(BASE_URL).callApi("GET", "/some/path")).toBe("string");
    });
  });

  describe("callApi — 401 retry", () => {
    it("re-authenticates and retries ONCE on 401", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "old" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("u", "p");
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Expired" }, 401))
        .mockResolvedValueOnce(jsonResponse({ access_token: "new" }))
        .mockResolvedValueOnce(jsonResponse({ items: ["data"] }));
      expect(await client.callApi("GET", "/v1/entries", undefined, undefined, true)).toEqual({ items: ["data"] });
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
    it("uses new token in retry", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "old" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("u", "p");
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401))
        .mockResolvedValueOnce(jsonResponse({ access_token: "fresh" }))
        .mockResolvedValueOnce(jsonResponse({}));
      await client.callApi("GET", "/v1/entries", undefined, undefined, true);
      expect(mockFetch.mock.calls[3][1].headers?.["Authorization"]).toBe("Bearer fresh");
    });
    it("does NOT retry more than once", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "tok" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("u", "p");
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401))
        .mockResolvedValueOnce(jsonResponse({ access_token: "new" }))
        .mockResolvedValueOnce(jsonResponse({}, 401));
      await expect(client.callApi("GET", "/v1/entries", undefined, undefined, true)).rejects.toThrow();
    });
    it("does NOT re-auth without credentials", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));
      await expect(new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries", undefined, undefined, true)).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("callApi — error handling", () => {
    it("throws with status code on 404", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Not Found" }, 404));
      await expect(new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries/x")).rejects.toThrow(/404/);
    });
    it("includes detail in error message", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Entry not found" }, 404));
      await expect(new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries/x")).rejects.toThrow(/Entry not found/);
    });
    it("throws on 500", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "ISE" }, 500));
      await expect(new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries")).rejects.toThrow();
    });
    it("throws on 403", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Forbidden" }, 403));
      await expect(new PhiactaClient(BASE_URL).callApi("POST", "/v1/entries", undefined, {}, true)).rejects.toThrow(/403/);
    });
    it("throws on network error", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries")).rejects.toThrow();
    });
  });

  describe("callApi — 5xx retry with backoff", () => {
    it("retries GET on 502 up to 3 times then fails", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ detail: "Bad Gateway" }, 502));
      await expect(new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries")).rejects.toThrow(/502/);
      // 1 initial + 3 retries = 4 calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("retries PUT on 503 and succeeds on retry", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ detail: "Service Unavailable" }, 503))
        .mockResolvedValueOnce(jsonResponse({ sha: "abc" }));
      const result = await new PhiactaClient(BASE_URL).callApi("PUT", "/v1/entries/x/files/f");
      expect(result).toEqual({ sha: "abc" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry POST on 502 (not idempotent)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Bad Gateway" }, 502));
      await expect(new PhiactaClient(BASE_URL).callApi("POST", "/v1/entries", undefined, {})).rejects.toThrow(/502/);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 500 (not transient)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "ISE" }, 500));
      await expect(new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries")).rejects.toThrow(/500/);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 400 (client error)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Bad Request" }, 400));
      await expect(new PhiactaClient(BASE_URL).callApi("GET", "/v1/entries")).rejects.toThrow(/400/);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("uploadFile", () => {
    it("sends multipart FormData with file and message", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("user", "pass");

      mockFetch.mockResolvedValueOnce(jsonResponse({ sha: "abc123" }));
      const content = new TextEncoder().encode("hello");
      await client.uploadFile("/v1/entries/x/files/f.txt", content, "msg");

      const [, opts] = mockFetch.mock.calls[1];
      expect(opts.method).toBe("PUT");
      expect(opts.body).toBeInstanceOf(FormData);
      expect(opts.headers["Authorization"]).toBe("Bearer jwt");
      // Must NOT set Content-Type (Fetch API handles boundary)
      expect(opts.headers["Content-Type"]).toBeUndefined();
    });

    it("retries uploadFile on 502 for PUT", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("user", "pass");

      mockFetch
        .mockResolvedValueOnce(jsonResponse({ detail: "Bad Gateway" }, 502))
        .mockResolvedValueOnce(jsonResponse({ sha: "retry-ok" }));

      const result = await client.uploadFile("/v1/entries/x/files/f.txt", new Uint8Array([1, 2, 3]));
      expect(result).toEqual({ sha: "retry-ok" });
      // login + 502 + success = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("401 retry on uploadFile re-authenticates then succeeds", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt1" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("user", "pass");

      mockFetch
        .mockResolvedValueOnce(jsonResponse({ detail: "Token expired" }, 401))
        .mockResolvedValueOnce(jsonResponse({ access_token: "jwt2" }))  // re-login
        .mockResolvedValueOnce(jsonResponse({ sha: "after-reauth" }));

      const result = await client.uploadFile("/v1/entries/x/files/f.txt", new Uint8Array([1]));
      expect(result).toEqual({ sha: "after-reauth" });
    });

    it("omits message from FormData when not provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: "jwt" }));
      const client = new PhiactaClient(BASE_URL);
      await client.login("user", "pass");

      mockFetch.mockResolvedValueOnce(jsonResponse({ sha: "abc" }));
      await client.uploadFile("/v1/entries/x/files/f.txt", new Uint8Array([1]));

      const formData: FormData = mockFetch.mock.calls[1][1].body;
      expect(formData.has("message")).toBe(false);
    });
  });
});
