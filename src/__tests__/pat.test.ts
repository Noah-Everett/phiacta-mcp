/**
 * Tests for PAT support in the MCP PhiactaClient (PHI-119).
 *
 * Tests cover:
 * - setToken() / getToken() methods
 * - 401 with PAT is a hard failure (no re-auth retry when no username/password)
 * - PAT sent as Bearer token in Authorization header
 */

import { describe, it, expect, vi } from "vitest";
import { PhiactaClient } from "../client.js";

const TEST_PAT = "pat_AbCdEfGh1234567890abcdefghijklmnopqrstuvw";
const TEST_BASE_URL = "http://localhost:8000";

// ---------------------------------------------------------------------------
// setToken / getToken
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
// 401 handling with PAT (no stored username/password → no retry)
// ---------------------------------------------------------------------------

describe("PAT 401 error handling", () => {
  it("401 with PAT and no stored credentials is a hard failure — no re-auth retry", async () => {
    const client = new PhiactaClient(TEST_BASE_URL);
    client.setToken(TEST_PAT);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Token expired" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    try {
      await expect(client.callApi("GET", "/v1/auth/me", undefined, undefined, true)).rejects.toThrow();

      // fetch should be called exactly once — no retry (no username/password stored)
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
      await expect(client.callApi("GET", "/v1/auth/me", undefined, undefined, true)).rejects.toThrow();

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
      new Response(JSON.stringify({ username: "alice" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    try {
      await client.callApi("GET", "/v1/auth/me", undefined, undefined, true);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Authorization"]).toBe(`Bearer ${TEST_PAT}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
