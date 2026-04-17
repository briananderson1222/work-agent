# Knowledge Access Rules

## Knowledge Base Access

Your knowledge lives in indexed knowledge bases (suffixed `-Memories`, `-Sales`, etc.), NOT in raw files. Follow this strictly:

1. **Always use the `knowledge` tool first** to search for sessions, continuity, followups, customer context, action items — anything stored in your knowledge directories.
2. **Never `read` or list directories** under `knowledge/memories/` or `knowledge/sales/` directly. These files are indexed and searchable via the `knowledge` tool.
3. **Fall back to `read` only** if the `knowledge` tool explicitly fails or returns zero results for a query you're confident should have matches.

This applies to ALL knowledge base content: sessions, continuity, followups, lessons, preferences, decisions, customer data, activities, plans, etc.

## Memory Model Summary

See `soul-protocol.md` for the full two-tier framework + operational state:
- **Tier 1 (Pointers):** Lightweight entries written automatically after artifact creation. Date, account, summary, source system, identifier, access method. No prompting needed.
- **Tier 2 (Curated knowledge):** Corrections, confirmed preferences, relationship nuance, strategic decisions. Requires justification before saving. Never auto-pruned.
- **Operational state:** Session context, handoffs, followups. Auto-expires. Not memory — separate lifecycle.

Update your knowledge only when you learn something genuinely worth keeping. Not everything is worth keeping.

## Instinct System Access

Instincts are learned behavioral patterns stored in `$SOUL_PATH/knowledge/instincts/`. They are indexed by the knowledge tool for semantic search.

### Search Rules
- Search for instincts relevant to the current task before starting work
- Filter by project scope: current project + global instincts
- Higher confidence instincts (≥0.7) should be applied automatically
- Lower confidence instincts (0.3-0.5) should be suggested but not enforced
- Never read instinct files directly — always search via the knowledge tool

### Observation Capture
- Observations are raw JSONL — NOT indexed for semantic search
- The analysis boo job consumes observations directly via file reads
- Do not attempt to search observations via the knowledge tool

### When to Query Instincts
- Before writing code: search for code-style and file-pattern instincts
- Before debugging: search for debugging and workflow instincts
- Before git operations: search for git instincts
- When the user asks about learned patterns: search all instinct domains
