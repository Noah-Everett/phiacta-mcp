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

const PAPER_INGESTION_PROMPT = `You are extracting structured knowledge from an academic paper into **entries** \
for the Phiacta knowledge platform. Your goal is to produce a complete, exhaustive \
list of every atomic piece of knowledge in the paper, then create each one as an \
entry using the available Phiacta tools.

## Step 1: Read the paper

The user has provided a paper as: {{paper}}

Determine what this is and read it:
- If it's a file path, read the file
- If it's a directory, find and read paper files within it
- If it's a URL, fetch the content
- If it's raw text, use it directly

Read the full paper before proceeding.

## Step 2: Search for existing entries

Before extracting, search for whether this paper (or parts of it) has already \
been ingested. If existing entries cover the same knowledge, reference them \
rather than creating duplicates.

Also search for entries that your new entries will want to reference — established \
definitions, theorems, or results from other papers that are already in Phiacta. \
Note their IDs for use in references later.

## Step 3: Plan the extraction

Extract **every** atomic piece of knowledge from the paper. Be exhaustive.

### What is an entry?

An entry is a single, versioned, citable unit of knowledge. Each entry is \
**atomic** — it represents exactly one thing. Do not combine multiple ideas \
into one entry. Larger structures like papers are represented by an \
argument entry that references the atomic entries.

### What to extract

1. **Definitions** — every defined term, quantity, or concept
2. **Theorems, lemmas, propositions, corollaries** — every formal statement
3. **Conjectures** — any unproven claims
4. **Methodological claims** — "our method does X," "algorithm Y achieves Z"
5. **Empirical results** — specific numerical results, benchmarks, comparisons
6. **Negative results** — things that didn't work, limitations discovered
7. **Key observations** — important remarks or insights
8. **Assumptions** — stated conditions or constraints
9. **Notation conventions** — if they define notation used throughout

### Extraction rules

1. Be **exhaustive**. Extract every definition, every theorem, every result. \
   When in doubt, make it an entry. Too many is better than too few.
2. Be **precise**. Use the paper's exact mathematical notation and statements. \
   Do not paraphrase theorems or weaken claims.
3. Map **all references** between entries. If theorem 3 uses lemma 1 and \
   definition 2, those references must be present. This is the most important \
   part of the extraction.
4. The **argument entry** should be created last. It represents the paper \
   itself and references every other entry, organizing them into the paper's \
   logical structure.
5. Include **negative results and limitations** as their own entries.
6. For **external references** (prior papers, established theorems) that are \
   NOT already in Phiacta, note them in the entry's content but do not create \
   references to nonexistent entries. If they ARE in Phiacta (found in Step 2), \
   include references to them.
7. Preserve the paper's **logical dependency structure** in references.

Before using any tools, plan your full extraction as a numbered list of entries \
with their types, titles, and references to other entries in your list. This lets \
you map out the dependency structure before creating anything.

## Step 4: Create entries

A large paper may produce dozens of entries. To keep things manageable, split the \
work into batches — process entries in parallel where possible rather than creating \
them one at a time sequentially.

For each entry, use the available Phiacta tools to:

1. **Create the entry** — with a concise title, one-sentence summary, and \
   appropriate type. Check the tool schemas for the available parameters.

2. **Upload content** — write the full entry body (mathematical content, \
   equations, explanations). Someone reading only this entry should understand \
   it without reading the paper.

3. **Tag the entry** — add tags for discoverability.

4. **Create references** — create typed links to other entries. Both the \
   source and target entries must exist before creating a reference.

Create entries in dependency order (definitions first, then theorems that use \
them, then results, then the argument entry last) so that reference targets \
exist before they are referenced.

## Step 5: Summary

After creating all entries, report:
- How many entries were created (by type)
- The argument entry's ID (the paper entry)
- Any existing Phiacta entries that were linked to
- Any external references that could not be linked (candidates for future ingestion)
- Any pieces of the paper that were difficult to represent
- Any observations about how well the entry format handled this paper`;

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
}
