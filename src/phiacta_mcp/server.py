# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Phiacta Contributors

"""MCP server exposing Phiacta API operations as tools.

Usage (stdio, for Claude Code / Claude Desktop):
    phiacta-mcp

Environment variables:
    PHIACTA_API_URL   — API base URL (default: http://localhost:8000)
    PHIACTA_EMAIL     — Agent email for authentication
    PHIACTA_PASSWORD  — Agent password for authentication
"""

from __future__ import annotations

import json
import os

from mcp.server.fastmcp import FastMCP

from phiacta_sdk import PhiactaClient, PhiactaApiError
from phiacta_sdk.models import EntryCreate, EntryRefCreate, EntryUpdate

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_URL = os.environ.get("PHIACTA_API_URL", "http://localhost:8000")
AGENT_EMAIL = os.environ.get("PHIACTA_EMAIL", "")
AGENT_PASSWORD = os.environ.get("PHIACTA_PASSWORD", "")

# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------

mcp = FastMCP(
    "phiacta",
    instructions=(
        "Phiacta is a knowledge platform where each entry represents an atomic "
        "piece of knowledge (a law, theorem, principle, observation, etc.). "
        "Entries are linked by typed references (generalizes, derives, supports, "
        "extends, specializes, related_to). Use these tools to explore existing "
        "knowledge and add new entries with proper references and tags."
    ),
)

# Shared client — created lazily on first use.
_client: PhiactaClient | None = None


async def _get_client() -> PhiactaClient:
    """Get or create the authenticated SDK client."""
    global _client
    if _client is None:
        _client = PhiactaClient(API_URL)
        if AGENT_EMAIL and AGENT_PASSWORD:
            try:
                await _client.login(AGENT_EMAIL, AGENT_PASSWORD)
            except PhiactaApiError:
                await _client.register(
                    handle=AGENT_EMAIL.split("@")[0],
                    email=AGENT_EMAIL,
                    password=AGENT_PASSWORD,
                )
    return _client


def _serialize(obj: object) -> str:
    """Serialize a pydantic model or list to JSON string for tool output."""
    if isinstance(obj, list):
        return json.dumps(
            [item.model_dump(mode="json") for item in obj], indent=2,
        )
    if hasattr(obj, "model_dump"):
        return json.dumps(obj.model_dump(mode="json"), indent=2)
    return json.dumps(obj, indent=2)


# ---------------------------------------------------------------------------
# Tools — Discovery
# ---------------------------------------------------------------------------


@mcp.tool()
async def list_entries(
    limit: int = 50,
    offset: int = 0,
    layout_hint: str | None = None,
    status: str = "active",
) -> str:
    """List entries in Phiacta with pagination.

    Use this to see what knowledge already exists before adding new entries.
    Returns titles, IDs, summaries, and layout hints.

    Args:
        limit: Max entries to return (1-200).
        offset: Pagination offset.
        layout_hint: Filter by type — law, theorem, assertion, evidence,
                     definition, hypothesis.
        status: Filter by status — active or archived.
    """
    client = await _get_client()
    result = await client.list_entries(
        limit=limit, offset=offset, layout_hint=layout_hint, status=status,
    )
    return _serialize(result)


@mcp.tool()
async def get_entry(entry_id: str) -> str:
    """Get full details for a single entry, including its references.

    Returns the entry metadata plus all incoming and outgoing refs.

    Args:
        entry_id: UUID of the entry.
    """
    client = await _get_client()
    result = await client.get_entry(entry_id)
    return _serialize(result)


@mcp.tool()
async def search_entries_by_tags(
    tags: str,
    mode: str = "or",
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Find entries matching one or more tags.

    Args:
        tags: Comma-separated tag names (e.g. "physics,classical-mechanics").
        mode: "or" matches any tag, "and" requires all tags.
        limit: Max results.
        offset: Pagination offset.
    """
    client = await _get_client()
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    result = await client.find_entries_by_tags(
        tag_list, mode=mode, limit=limit, offset=offset,
    )
    return _serialize(result)


@mcp.tool()
async def get_entry_tags(entry_id: str) -> str:
    """Get tags for an entry.

    Args:
        entry_id: UUID of the entry.
    """
    client = await _get_client()
    result = await client.get_entry_tags(entry_id)
    return _serialize(result)


@mcp.tool()
async def get_entry_references(
    entry_id: str,
    direction: str = "both",
) -> str:
    """Get references (links) for an entry.

    Args:
        entry_id: UUID of the entry.
        direction: "both", "incoming", or "outgoing".
    """
    client = await _get_client()
    result = await client.get_entry_references(entry_id, direction=direction)
    return _serialize(result)


# ---------------------------------------------------------------------------
# Tools — Creation
# ---------------------------------------------------------------------------


@mcp.tool()
async def create_entry(
    title: str,
    summary: str,
    layout_hint: str = "assertion",
    content_format: str = "markdown",
    license: str | None = None,
    content: str | None = None,
) -> str:
    """Create a new knowledge entry in Phiacta.

    Each entry should be an atomic piece of knowledge — a single law, theorem,
    principle, definition, observation, or hypothesis.

    Args:
        title: Clear, concise name (e.g. "Newton's Second Law").
        summary: One-sentence description of the knowledge.
        layout_hint: Type of knowledge — law, theorem, assertion, evidence,
                     definition, hypothesis.
        content_format: Format for content — markdown, latex, plain.
        license: Optional SPDX license identifier.
        content: Optional detailed content/explanation.
    """
    client = await _get_client()
    entry = EntryCreate(
        title=title,
        summary=summary,
        layout_hint=layout_hint,
        content_format=content_format,
        license=license,
        content=content,
    )
    result = await client.create_entry(entry)
    return _serialize(result)


@mcp.tool()
async def create_entry_ref(
    from_entry_id: str,
    to_entry_id: str,
    rel: str,
    note: str | None = None,
) -> str:
    """Create a typed reference between two entries.

    References express relationships in the knowledge graph. The direction
    matters: from_entry relates TO to_entry.

    Args:
        from_entry_id: UUID of the source entry.
        to_entry_id: UUID of the target entry.
        rel: Relationship type — generalizes, specializes, derives, supports,
             extends, related_to.
        note: Optional note explaining the relationship.
    """
    client = await _get_client()
    ref = EntryRefCreate(
        from_entry_id=from_entry_id,
        to_entry_id=to_entry_id,
        rel=rel,
        note=note,
    )
    result = await client.create_entry_ref(ref)
    return _serialize(result)


@mcp.tool()
async def set_entry_tags(
    entry_id: str,
    tags: str,
) -> str:
    """Set tags on an entry (replaces all existing tags).

    Tags categorize entries by domain and topic. Use lowercase, hyphenated
    names (e.g. "physics", "classical-mechanics", "quantum-mechanics").

    Args:
        entry_id: UUID of the entry.
        tags: Comma-separated tag names (e.g. "physics,classical-mechanics").
    """
    client = await _get_client()
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    result = await client.set_entry_tags(entry_id, tag_list)
    return _serialize(result)


# ---------------------------------------------------------------------------
# Tools — Modification
# ---------------------------------------------------------------------------


@mcp.tool()
async def update_entry(
    entry_id: str,
    title: str | None = None,
    summary: str | None = None,
    layout_hint: str | None = None,
    content_format: str | None = None,
    license: str | None = None,
) -> str:
    """Update an existing entry's metadata.

    Only provided fields are updated — omitted fields stay unchanged.

    Args:
        entry_id: UUID of the entry to update.
        title: New title.
        summary: New summary.
        layout_hint: New layout hint.
        content_format: New content format.
        license: New license.
    """
    client = await _get_client()
    update = EntryUpdate(
        title=title,
        summary=summary,
        layout_hint=layout_hint,
        content_format=content_format,
        license=license,
    )
    result = await client.update_entry(entry_id, update)
    return _serialize(result)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the MCP server (stdio transport)."""
    mcp.run()


if __name__ == "__main__":
    main()
