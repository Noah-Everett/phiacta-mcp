// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * Generic HTTP client for the Phiacta API.
 * Handles authentication, request/response plumbing, and 401 retry.
 */

export class PhiactaClient {
  private baseUrl: string;
  private token: string | null = null;
  private handle: string | null = null;
  private password: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async login(handle: string, password: string): Promise<void> {
    this.handle = handle;
    this.password = password;

    const url = `${this.baseUrl}/v1/auth/login`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, password }),
    });

    if (!resp.ok) {
      let detail: string;
      try {
        const err = (await resp.json()) as { detail?: string };
        detail = err.detail ?? resp.statusText;
      } catch {
        detail = resp.statusText;
      }
      throw new Error(`HTTP ${resp.status}: ${detail}`);
    }

    const result = (await resp.json()) as { access_token: string };
    this.token = result.access_token;
  }

  async fetchOpenApiSpec(): Promise<unknown> {
    const url = `${this.baseUrl}/openapi.json`;
    const resp = await fetch(url, { method: "GET" });

    if (!resp.ok) {
      let detail: string;
      try {
        const err = (await resp.json()) as { detail?: string };
        detail = err.detail ?? resp.statusText;
      } catch {
        detail = resp.statusText;
      }
      throw new Error(`HTTP ${resp.status}: ${detail}`);
    }

    return resp.json();
  }

  async callApi(
    method: string,
    path: string,
    params?: Record<string, any>,
    body?: unknown,
    auth?: boolean
  ): Promise<unknown> {
    return this._callApiInner(method, path, params, body, auth, false);
  }

  private async _callApiInner(
    method: string,
    path: string,
    params: Record<string, any> | undefined,
    body: unknown | undefined,
    auth: boolean | undefined,
    isRetry: boolean
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {};
    if (auth && this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const resp = await fetch(url.toString(), {
      method: method.toUpperCase(),
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // 401 retry: re-authenticate once if this was an auth'd request with stored credentials
    if (resp.status === 401 && !isRetry && auth !== false && this.handle && this.password) {
      try {
        await this.login(this.handle, this.password);
        return this._callApiInner(method, path, params, body, auth, true);
      } catch {
        // Re-auth failed, fall through to normal error handling
      }
    }

    if (!resp.ok) {
      let detail: string;
      try {
        const err = (await resp.json()) as { detail?: string };
        detail = err.detail ?? resp.statusText;
      } catch {
        detail = resp.statusText;
      }
      throw new Error(`HTTP ${resp.status}: ${detail}`);
    }

    const contentType = resp.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      return resp.json();
    }
    return resp.text();
  }
}
