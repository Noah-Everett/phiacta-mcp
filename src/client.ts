// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * Thin HTTP client for the Phiacta API.
 * Handles authentication and request/response plumbing.
 */

/** All API paths are prefixed with /v1. */
const API_PREFIX = "/v1";

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  params?: Record<string, string>;
  auth?: boolean;
}

export class PhiactaClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request(opts: RequestOptions): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${opts.path}`);
    if (opts.params) {
      for (const [k, v] of Object.entries(opts.params)) {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, v);
        }
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (opts.auth && this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const resp = await fetch(url.toString(), {
      method: opts.method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
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

    return resp.json();
  }

  // ---- Auth ----

  async login(handle: string, password: string): Promise<unknown> {
    const result = await this.request({
      method: "POST",
      path: `${API_PREFIX}/auth/login`,
      body: { handle, password },
    });
    this.token = (result as { access_token: string }).access_token;
    return result;
  }

  async register(handle: string, password: string): Promise<unknown> {
    const result = await this.request({
      method: "POST",
      path: `${API_PREFIX}/auth/register`,
      body: { handle, password },
    });
    this.token = (result as { access_token: string }).access_token;
    return result;
  }

  // ---- Entries ----

  async listEntries(opts: {
    limit?: number;
    offset?: number;
    layout_hint?: string;
    status?: string;
  } = {}): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `${API_PREFIX}/entries`,
      params: {
        limit: String(opts.limit ?? 50),
        offset: String(opts.offset ?? 0),
        status: opts.status ?? "active",
        ...(opts.layout_hint ? { layout_hint: opts.layout_hint } : {}),
      },
    });
  }

  async getEntry(entryId: string): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `${API_PREFIX}/entries/${entryId}`,
    });
  }

  async createEntry(entry: {
    title: string;
    summary?: string;
    layout_hint?: string;
    content_format?: string;
    license?: string;
    content?: string;
  }): Promise<unknown> {
    return this.request({
      method: "POST",
      path: `${API_PREFIX}/entries`,
      auth: true,
      body: entry,
    });
  }

  async updateEntry(
    entryId: string,
    update: {
      title?: string;
      summary?: string;
      layout_hint?: string;
      content_format?: string;
      license?: string;
    }
  ): Promise<unknown> {
    // Strip undefined values
    const body = Object.fromEntries(
      Object.entries(update).filter(([, v]) => v !== undefined && v !== null)
    );
    return this.request({
      method: "PATCH",
      path: `${API_PREFIX}/entries/${entryId}`,
      auth: true,
      body,
    });
  }

  // ---- Entry Refs ----

  async getEntryReferences(
    entryId: string,
    direction: string = "both"
  ): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `${API_PREFIX}/entries/${entryId}/references`,
      params: { direction },
    });
  }

  async createEntryRef(ref: {
    from_entry_id: string;
    to_entry_id: string;
    rel: string;
    note?: string;
  }): Promise<unknown> {
    return this.request({
      method: "POST",
      path: `${API_PREFIX}/entry-refs`,
      auth: true,
      body: ref,
    });
  }

  // ---- Tags ----

  async getEntryTags(entryId: string): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `${API_PREFIX}/extensions/tags/`,
      params: { entry_id: entryId },
    });
  }

  async setEntryTags(entryId: string, tags: string[]): Promise<unknown> {
    return this.request({
      method: "PUT",
      path: `${API_PREFIX}/extensions/tags/${entryId}`,
      auth: true,
      body: { tags },
    });
  }

  async findEntriesByTags(opts: {
    tags: string[];
    mode?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    return this.request({
      method: "GET",
      path: `${API_PREFIX}/extensions/tags/entries`,
      params: {
        tags: opts.tags.join(","),
        mode: opts.mode ?? "or",
        limit: String(opts.limit ?? 50),
        offset: String(opts.offset ?? 0),
      },
    });
  }
}
