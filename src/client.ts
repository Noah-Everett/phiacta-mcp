// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * Generic HTTP client for the Phiacta API.
 * Handles authentication, request/response plumbing, and 401 retry.
 */

export interface PluginProviderInfo {
  fields: string[];
  writable_fields: string[];
  required_on_create: string[];
  include_in_list: boolean;
  include_in_detail: boolean;
}

export interface DocInfo {
  name: string;
  slug: string;
  description: string;
  content: string;
}

export interface PluginInfo {
  name: string;
  type: string;
  version: string;
  description: string;
  depends_on: string[];
  provider?: PluginProviderInfo | null;
}

const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "DELETE", "HEAD"]);
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryable(method: string, status: number): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase()) && RETRYABLE_STATUS_CODES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PhiactaClient {
  private baseUrl: string;
  private token: string | null = null;
  private handle: string | null = null;
  private password: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * Set a bearer token directly (e.g. a PAT).
   * Skips login — the token is used as-is for all authenticated requests.
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Get the current bearer token, if any.
   */
  getToken(): string | undefined {
    return this.token ?? undefined;
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

  async fetchPlugins(): Promise<PluginInfo[]> {
    const url = `${this.baseUrl}/v1/plugins`;
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      return []; // graceful fallback if endpoint unavailable
    }
    return resp.json() as Promise<PluginInfo[]>;
  }

  async fetchDocs(): Promise<DocInfo[]> {
    const url = `${this.baseUrl}/v1/docs`;
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      return []; // graceful fallback if endpoint unavailable
    }
    return resp.json() as Promise<DocInfo[]>;
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

  /**
   * Upload a file via multipart/form-data.
   *
   * The file bytes are sent as the "content" form part, and an optional
   * commit message is sent as the "message" form field.
   * Content-Type is NOT set manually — the Fetch API sets it automatically
   * with the correct multipart boundary.
   */
  async uploadFile(
    path: string,
    fileBytes: Uint8Array,
    message?: string,
    method: string = "PUT",
  ): Promise<unknown> {
    return this._uploadFileInner(path, fileBytes, message, method, false);
  }

  private async _uploadFileInner(
    path: string,
    fileBytes: Uint8Array,
    message: string | undefined,
    method: string,
    isRetry: boolean,
    attempt: number = 0,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    const formData = new FormData();
    formData.append("content", new Blob([fileBytes as unknown as BlobPart]), "file");
    if (message !== undefined) {
      formData.append("message", message);
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    // Do NOT set Content-Type — Fetch API handles multipart boundary

    const resp = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body: formData,
    });

    // 401 retry: re-authenticate once with stored credentials
    if (resp.status === 401 && !isRetry && this.handle && this.password) {
      try {
        await this.login(this.handle, this.password);
        return this._uploadFileInner(path, fileBytes, message, method, true, attempt);
      } catch {
        // Re-auth failed, fall through to normal error handling
      }
    }

    // Retry with exponential backoff on transient 5xx for idempotent methods
    if (isRetryable(method, resp.status) && attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
      return this._uploadFileInner(path, fileBytes, message, method, isRetry, attempt + 1);
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

  private async _callApiInner(
    method: string,
    path: string,
    params: Record<string, any> | undefined,
    body: unknown | undefined,
    auth: boolean | undefined,
    isRetry: boolean,
    attempt: number = 0,
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {};
    // Always include the token when available so the backend can
    // apply owner-specific visibility (e.g. archived entries).
    // When auth is explicitly true, the caller requires auth; here
    // we pass the token opportunistically on all requests.
    if (this.token) {
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
        return this._callApiInner(method, path, params, body, auth, true, attempt);
      } catch {
        // Re-auth failed, fall through to normal error handling
      }
    }

    // Retry with exponential backoff on transient 5xx for idempotent methods
    if (isRetryable(method, resp.status) && attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
      return this._callApiInner(method, path, params, body, auth, isRetry, attempt + 1);
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
