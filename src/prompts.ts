// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Phiacta Contributors

/**
 * MCP prompt definitions.
 *
 * Prompts are reusable workflow templates that connected clients discover
 * through the standard MCP protocol (e.g., they show up as slash commands
 * in Claude Code).
 *
 * IMPORTANT: Do not hardcode specific tool names, field names, file paths,
 * or extension/plugin names. The tools are auto-discovered from the backend
 * OpenAPI spec and their schemas describe their own parameters. Prompts
 * should describe domain concepts and workflows, not implementation details.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const PAPER_INGESTION_PROMPT = `You are extracting structured knowledge from an academic \
paper into Phiacta.

Read the Phiacta MCP resources before starting — they document entry types, reference \
roles, content formats, tag conventions, and content writing guidelines.

## Input

{{paper}}

Read the **full paper** before doing anything else.

## Workflow

### 1. Search

Search Phiacta for this paper's title, key terms, and author names. Note any existing \
entries you can reference instead of duplicating. Also search for definitions or results \
from prior work that your new entries will cite.

### 2. Plan

Write a numbered list of every entry to create: proposed title, entry type, and which \
other entries it references (by list number and by existing Phiacta ID). This maps the \
dependency structure before you touch the API.

### 3. Create the paper entry

Create an entry with type "argument" (title, summary, content, tags — all in one call). \
Wait for repo_status = "ready", then **archive** it. It stays hidden until everything \
is wired up.

### 4. Create atomic entries in dependency order

For each entry in your plan:

1. **Create in a single call** with all fields (title, entry_type, summary, tags, \
content, content_format). Do not make separate calls to set metadata.
2. **Create references** — the one thing that requires a separate call, since the \
target must exist. Create inter-atomic refs and a paper-to-atomic ref.

### 5. Unarchive the paper entry

### 6. Report

Total entries by type, the paper entry ID, existing entries linked to, and external \
references that could not be linked (candidates for future ingestion).`;

const ENTRY_REVIEW_PROMPT = `You are reviewing an entry in the Phiacta knowledge platform. \
Your job is to assess its accuracy, completeness, and quality, then suggest or make \
improvements.

## Entry to review

{{entry_id}}

## Process

**Step 1: Read everything.** Get the entry's full detail (title, summary, type, tags, \
references) AND its content. Read both carefully before evaluating.

**Step 2: Assess accuracy.**
- Is the content factually correct?
- Are mathematical statements precise and properly conditioned?
- Are there logical errors, gaps in reasoning, or unstated assumptions?
- Does the title accurately describe what the entry contains?
- Does the summary faithfully capture the key claim?
- Is the entry type appropriate for what this entry actually is?

**Step 3: Assess completeness.**
- Does the content fully capture the knowledge it claims to represent?
- Could someone understand this entry without reading the original source?
- Are there missing conditions, edge cases, or important caveats?
- Are there important related concepts that should be mentioned?

**Step 4: Assess references.**
- Search Phiacta for entries that this entry should reference but doesn't.
- Are existing references appropriate? Is the relation type correct?
- Does this entry depend on definitions or results that should be linked?

**Step 5: Assess discoverability.**
- Are the tags comprehensive? Would someone searching for this topic find it?
- Is the title specific enough to distinguish it from similar entries?

**Step 6: Act on findings.**
- Metadata issues (title, summary, type, tags): offer to fix them immediately \
using the update tool.
- Missing references: offer to create them.
- Content issues: describe the problem precisely with a suggested fix. \
If the entry has an issue tracker, create an issue.
- If everything looks good, say so — not every entry needs changes.

**Step 7: Report.**
Summarize with:
- **Verdict**: Good / Needs minor fixes / Needs significant revision
- **What's correct**: What the entry does well
- **Issues found**: Specific problems with suggested fixes
- **Actions taken**: What you fixed (if anything)
- **Actions recommended**: What the entry owner should fix`;

const KNOWLEDGE_GAP_PROMPT = `You are analyzing the Phiacta knowledge platform to map \
coverage of a topic and identify what's missing.

## Topic

{{topic}}

## Process

**Step 1: Search broadly.** Don't just search once — try multiple queries:
- The topic name directly
- Key subtopics and subfields
- Important theorems, results, or concepts within the topic
- Prominent researchers or papers in the field
- Related and adjacent topics

Collect every relevant entry you find.

**Step 2: Map what exists.** Organize found entries into a structured overview:
- Group by subtopic
- Note entry types (definitions, theorems, results, etc.)
- Note how entries connect via references
- Identify the most and least covered subtopics

**Step 3: Identify gaps.** For each subtopic, ask:
- Are the foundational **definitions** present? A theorem about X is useless \
if X isn't defined as an entry.
- Are key **theorems and results** represented? Check the major results \
that any introduction to this topic would cover.
- Are there **broken dependency chains**? An entry that references a concept \
but that concept has no entry is a gap.
- Are there **isolated entries** with no references? They might be missing \
connections to the broader knowledge graph.
- What would a textbook chapter on this topic cover that Phiacta doesn't?

**Step 4: Prioritize.**
- **Critical gaps**: Missing definitions or theorems that existing entries depend on. \
These break the knowledge graph's coherence.
- **Important gaps**: Key results or concepts that any coverage of this topic should include. \
Their absence makes the coverage incomplete.
- **Opportunities**: Supporting details, examples, applications, or connections to \
other fields that would enrich the coverage.

**Step 5: Report.**
Present:
- **Coverage summary**: What exists, organized by subtopic. How many entries, \
what types, how well connected.
- **Gap list**: Each gap with its priority, a proposed entry title and type, \
and a brief content outline.
- **Suggested references**: How proposed entries would connect to existing ones.
- **Recommended ingestion order**: Which gaps to fill first based on dependencies.

If the user wants, offer to create the proposed entries.`;

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "paper-ingestion",
    "Extract structured knowledge entries from an academic paper and create them in Phiacta",
    { paper: z.string().describe("The paper to ingest — a file path, directory, URL, or raw text content") },
    ({ paper }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: PAPER_INGESTION_PROMPT.replace("{{paper}}", paper),
          },
        },
      ],
    })
  );

  server.prompt(
    "entry-review",
    "Review an existing Phiacta entry for accuracy, completeness, and quality",
    { entry_id: z.string().describe("The UUID of the entry to review") },
    ({ entry_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: ENTRY_REVIEW_PROMPT.replace("{{entry_id}}", entry_id),
          },
        },
      ],
    })
  );

  server.prompt(
    "knowledge-gap",
    "Analyze Phiacta's coverage of a topic and identify missing entries",
    { topic: z.string().describe("The topic or field to analyze for coverage gaps") },
    ({ topic }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: KNOWLEDGE_GAP_PROMPT.replace("{{topic}}", topic),
          },
        },
      ],
    })
  );
}
