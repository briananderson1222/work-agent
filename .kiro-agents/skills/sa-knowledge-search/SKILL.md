---
name: "sa-knowledge-search"
description: "Semantic and keyword search across all knowledge domains via tool-qmd with graph index for link traversal."
---

# Knowledge Search

Search across the portable soul knowledge base using QMD — hybrid BM25 keyword search, vector semantic search, and LLM re-ranking. Optionally traverse the knowledge graph for connected context.

## Trigger Patterns

This skill activates when:

- The user asks to search knowledge: "what do I know about...", "find my notes on...", "search for..."
- The user asks to recall past context: "what did we decide about...", "any lessons on...", "what's my preference for..."
- The agent needs context to answer a question and the built-in `knowledge` tool returns insufficient results
- The user references a specific knowledge domain: "check sales for...", "look in my journal for..."
- The user asks about relationships: "who's involved with...", "what's connected to...", "what accounts does X touch?"

## Available Collections

| Collection | Domain | Contains |
|---|---|---|
| `soul` | General | Lessons, preferences, decisions, sessions, continuity, followups |
| `soul-sales` | Sales | Territory notes, account hubs, meeting notes, people, activities, contacts, plans, PFRs |
| `soul-career` | Career | MBRs, job log, highlights, 1:1s, growth tracking |
| `soul-aws` | AWS | Bookmarks, TLI, TFC, internal references |
| `soul-journal` | Journal | Daily session logs |

## Graph Index

A link graph is maintained at `{{SOUL_PATH}}/knowledge/_graph.json`. It maps every wikilink in the vault as an edge between nodes. Use it for:

- **Traversal:** "what notes are connected to this account/person?"
- **Bridge detection:** "which people connect multiple accounts?"
- **Neighborhood:** "give me all context within 2 hops of X"

The graph is regenerated on each `soul-sync` run. Structure:
```json
{
  "nodes": {"path/to/note": {"type": "meeting", "name": "note-name"}},
  "edges": [{"from": "path/to/note", "to": "person-name"}]
}
```

## Workflow

### Step 1: CHOOSE SEARCH MODE

- **Quick lookup** (keyword match expected) → delegate to **tool-qmd** with `qmd_search`
- **Conceptual search** (meaning-based, fuzzy) → delegate to **tool-qmd** with `qmd_vector_search`
- **Best quality** (important query, need high relevance) → delegate to **tool-qmd** with `qmd_deep_search`

### Step 2: SCOPE THE SEARCH

- If the query is about a specific domain, scope to that collection: `-c soul-sales`, `-c soul-career`
- If the domain is unclear, search across all collections (no `-c` flag)

### Step 3: TRAVERSE THE GRAPH (when relationships matter)

When the query involves people, accounts, or connections:

1. Read `_graph.json` via `qmd_get` or file read
2. Find the node matching the search result
3. Follow edges to discover connected notes and people
4. For 2-hop queries: follow edges from the connected nodes too

**When to traverse:**
- "Who's involved with [topic]?" → search topic, then follow people links from results
- "Prepare me for a meeting with [account]" → find hub, traverse all connected notes
- "What else is [person] working on?" → find all notes linking to that person
- "How are [account A] and [account B] related?" → find shared people/notes

**When NOT to traverse:**
- Simple fact lookup ("what's Brose's TAS?") → qmd search is enough
- Keyword search ("find the RFP estimate") → qmd search is enough

### Step 4: RETRIEVE FULL CONTEXT

- If search results are snippets and more context is needed, use `qmd_get` to retrieve the full document
- If multiple related documents are found, use `qmd_multi_get` to retrieve them together

### Step 5: SYNTHESIZE

- Present findings to the user with source attribution (which file, which collection)
- If results span multiple domains, organize by domain
- If graph traversal was used, show the connection path (e.g., "Found via: SC3 note → Richard Kelch → Brose hub")
- If no results found, fall back to the built-in `knowledge` tool or suggest the user may need to capture this context

## Key Principles

- Prefer `qmd_deep_search` for important queries — it uses query expansion and reranking for best results
- Use `qmd_search` for fast keyword lookups where exact terms are known
- Use graph traversal when the question is about relationships, preparation, or "what else"
- Always attribute results to their source file so the user can find and edit them
- If QMD is unavailable (not installed, no collections), fall back to the built-in `knowledge` tool
