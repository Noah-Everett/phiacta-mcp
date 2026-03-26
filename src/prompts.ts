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

const PAPER_INGESTION_PROMPT = `You are extracting structured knowledge from an academic paper \
into the Phiacta knowledge platform.

## Input

The user has provided: {{paper}}

Read this first. If it's a file path or directory, read the files. If it's raw text, use it \
directly. Read the **full paper** before doing anything else.

## Goal

Every atomic piece of knowledge in the paper becomes its own entry. An entry represents \
exactly ONE thing — a definition, a theorem, a result, an observation. Never combine \
multiple ideas into one entry.

The paper itself becomes an **argument** entry that references all the atomic entries, \
organizing them into the paper's logical structure. Create this last.

## Before creating anything

1. **Search first.** Search Phiacta for this paper's title, key terms, and author names. \
If entries already exist for this paper, reference them instead of duplicating.

2. **Search for reference targets.** The entries you create will cite prior work. Search \
for definitions, theorems, or results from other papers that are already in Phiacta. \
Note their IDs — you'll create references to them later.

3. **Plan the full extraction.** Write out a numbered list of every entry you intend to \
create, with:
   - Proposed title (concise, precise)
   - Entry type (definition, theorem, lemma, proposition, corollary, conjecture, \
     empirical, methodology, observation, assumption, assertion, proof, argument, \
     refutation, hypothesis)
   - Which other entries in your list it references (by number)
   - Which existing Phiacta entries it references (by ID)

This plan is critical. It maps the paper's dependency structure before you touch the API. \
Get it right before proceeding.

## Creating entries

### Step A: Create the paper entry first

Create the argument/paper entry immediately with its title, summary, and type "argument". \
Wait for it to become ready (repo_status = "ready"), then **archive it**. This keeps it \
hidden from browse until all atomic entries and references are in place.

### Step B: Create atomic entries with references

Work through your plan in dependency order — definitions first, then theorems that use \
them, then results. For each atomic entry:

1. **Create the entry** with title, type, summary (one sentence), and content. \
Use markdown with inline LaTeX math ($...$ and $$...$$) for content_format — NOT \
raw latex format. The website renders markdown with KaTeX math support.

2. **Write self-contained content.** Someone reading only this entry — without the paper — \
must understand it fully. Include all necessary context, conditions, and notation. \
Use the paper's exact mathematical statements; do not paraphrase or weaken claims.

3. **Tag for discoverability.** Add tags for the field, subfield, key concepts, and \
techniques. Include the paper's arXiv ID if applicable (e.g., arxiv:2401.12345).

4. **Create references immediately** after creating each entry. Use the references API \
(the references extension endpoint) — do NOT just mention entry IDs in content text. \
For each new entry, create:
   - **Inter-atomic references**: if this entry depends on earlier entries (e.g., a \
     theorem uses a definition), create those references now.
   - **Paper reference**: create a reference from the paper entry to this atomic entry. \
     The paper entry is archived but references still work on archived entries.
   - Use relation types: "cites", "derives_from", "supports", "evidence", "context".

### Step C: Unarchive the paper entry

After all atomic entries and references are created, **unarchive** the paper entry. \
It is now complete with references to every atomic entry in the knowledge graph.

## What to extract

Be exhaustive. When in doubt, make it an entry.

- Every **definition** — defined terms, quantities, concepts
- Every **theorem, lemma, proposition, corollary** — exact statements
- Every **conjecture** — unproven claims
- Every **methodological claim** — "our method achieves X"
- Every **empirical result** — specific numbers, benchmarks, comparisons
- Every **negative result** — what didn't work, limitations
- Every **key observation** — important insights or remarks
- Every **assumption** — stated conditions or constraints
- **Notation conventions** if they define notation used throughout
- **Software tools and packages** — these ARE knowledge. AMFlow, SOFIA, etc. are \
methodologies/definitions. Create entries for them.

## Figures and visual content

Entries can have supplementary files. If the paper contains figures, diagrams, or plots:

1. **Upload the file** to the entry's repo (e.g., path "figures/diagram.png")
2. **Reference it in content** with markdown: ![description](figures/diagram.png) \
The website renders these inline automatically.
3. **Describe the content textually** too — someone reading the text should understand \
the key information even without seeing the figure.

For Feynman diagrams, flow charts, or other visual structures: describe the topology \
or structure in text/LaTeX, and upload the original figure if available.

## Linking between entries

In entry content, link to other Phiacta entries with standard markdown: \
[Entry Title](/entries/{id}). This creates a clickable link on the website. \
Note: this is a content link for reading convenience — always ALSO create a formal \
reference via the references API for the knowledge graph.

## After creating everything

Report:
- Total entries created, broken down by type
- The argument entry's ID (the paper entry)
- Existing Phiacta entries that were linked to
- External references that couldn't be linked (candidates for future ingestion)`;

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
