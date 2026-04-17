---
name: "qmd"
displayName: "QMD Knowledge Search"
description: "Local hybrid search across knowledge bases, notes, and documents. BM25 keyword search, vector semantic search, and LLM re-ranking — all running locally."
keywords: ["search", "knowledge", "memory", "semantic", "notes", "markdown", "qmd"]
---

# QMD Knowledge Search

Local hybrid search engine for the portable soul knowledge base and any indexed markdown collections.

## Available Tools
- `qmd_search` — Fast BM25 keyword search (supports collection filter)
- `qmd_vector_search` — Semantic vector search (supports collection filter)
- `qmd_deep_search` — Deep search with query expansion and reranking (best quality)
- `qmd_get` — Retrieve document by path or docid
- `qmd_multi_get` — Retrieve multiple documents by glob pattern
- `qmd_status` — Index health and collection info

## When to Use
- Searching across knowledge bases (lessons, decisions, preferences, sales, etc.)
- Finding related context by meaning, not just keywords
- Retrieving specific documents by path or ID
- When the built-in `knowledge` tool returns insufficient results

## Prerequisites
- `qmd` must be installed: `npm install -g @tobilu/qmd`
- Collections must be indexed: `qmd collection add <path> --name <name>`
- Embeddings must be generated: `qmd embed`
