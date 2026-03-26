/**
 * Tests for PAT support in the MCP PhiactaClient (PHI-119).
 *
 * Tests cover:
 * - setToken() method
 * - PHIACTA_TOKEN env var skips login
 * - 401 with PAT is a hard failure (no re-auth retry)
 * - PAT takes hard precedence over handle/password
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// We import the client module under test. Since the MCP repo's src/ is a stub,
// the import path matches the expected final module structure.
// ---------------------------------------------------------------------------
import { PhiactaClient } from "../client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_PAT = "pat_AbCdEfGh1234567890abcdefghijklmnopqrstuvw";
const TEST_BASE_URL = "http://localhost:8000";

// ---------------------------------------------------------------------------
// setToken
// ---------------------------------------------------------------------------

describe("PhiactaClient.setToken", () => {
  it("sets the token used in subsequent requests", () => {
    const client = new PhiactaClient(TEST_BASE_URL);
    expect(client.getToken()).toBeUndefined();

    client.setToken(TEST_PAT);
    expect(client.getToken()).toBe(TEST_PAT);
  });

  it("overwrites a previously set token", () => {
    const client = new PhiactaClient(TEST_BASE_URL);
    client.setToken("pat_first_token_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    client.setToken(TEST_PAT);
    expect(client.getToken()).toBe(TEST_PAT);
  });

  it("accepts any string as token (no validation)", () => {
    const client = new PhiactaClient(TEST_BASE_URL);
    // setToken should accept any string — validation happens server-side
    client.setToken("jwt-token-or-anything");
    expect(client.getToken()).toBe("jwt-token-or-anything");
  });
});

// ---------------------------------------------------------------------------
// PHIACTA_TOKEN env var
// ---------------------------------------------------------------------------

describe("PHIACTA_TOKEN environment variable", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("when PHIACTA_TOKEN is set, login flow is skipped", async () => {
    process.env.PHIACTA_TOKEN = TEST_PAT;
    const client = new PhiactaClient(TEST_BASE_URL);

    // The client should use the env var token directly
    expect(client.getToken()).toBe(TEST_PAT);
  });

  it("PHIACTA_TOKEN takes precedence over handle/password", async () => {
    process.env.PHIACTA_TOKEN = TEST_PAT;

    // Even if handle/password are provided, PAT should be used
    const client = new PhiactaClient(TEST_BASE_URL, {
      handle: "alice",
      password: "SecurePass123!",
    });

    // Token should be the PAT from env, not obtained via login
    expect(client.getToken()).toBe(TEST_PAT);
  });

  it("without PHIACTA_TOKEN, token is initially undefined", () => {
    delete process.env.PHIACTA_TOKEN;
    const client = new PhiactaClient(TEST_BASE_URL);
    expect(client.getToken()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 401 handling with PAT
// ---------------------------------------------------------------------------

describe("PAT 401 error handling", () => {
  it("401 with PAT is a hard failure — no re-auth retry", async () => {
    const client = new PhiactaClient(TEST_BASE_URL);
    client.setToken(TEST_PAT);

    // Mock fetch to return 401
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Token expired" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    // Replace the client's internal fetch mechanism
    vi.stubGlobal("fetch", mockFetch);

    try {
      await expect(client.request("GET", "/v1/auth/me")).rejects.toThrow();

      // fetch should be called exactly once — no retry
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("401 with PAT does not clear the token", async () => {
    const client = new PhiactaClient(TEST_BASE_URL);
    client.setToken(TEST_PAT);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    try {
      await expect(client.request("GET", "/v1/auth/me")).rejects.toThrow();

      // Token should still be set after 401
      expect(client.getToken()).toBe(TEST_PAT);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ---------------------------------------------------------------------------
// Authorization header
// ---------------------------------------------------------------------------

describe("PAT in Authorization header", () => {
  it("sends PAT as Bearer token in Authorization header", async () => {
    const client = new PhiactaClient(TEST_BASE_URL);
    client.setToken(TEST_PAT);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ handle: "alice" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    try {
      await client.request("GET", "/v1/auth/me");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(options.headers["Authorization"] || options.headers["authorization"])
        .toBe(`Bearer ${TEST_PAT}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
