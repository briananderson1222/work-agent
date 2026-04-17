---
name: "transcript-research"
description: "Download YouTube video transcripts, analyze and categorize them against existing vault content, and store as structured Obsidian notes in the thought-leadership research collection."
keywords: ["transcript", "youtube", "video", "yt-dlp", "thought-leadership", "research", "obsidian"]
---

# Transcript Research

Download, analyze, and store YouTube video transcripts as thought-leadership research notes.

## Trigger Patterns

This skill activates when the user:
- Shares a YouTube URL and wants the transcript captured
- Says "get the transcript from...", "transcribe this video", "save this talk"
- Asks to add a video to the research collection or thought-leadership vault
- Shares a playlist URL for batch processing

## Prerequisites

- `yt-dlp` must be installed (`brew install yt-dlp`)
- `tool-transcripts` agent must be available (check via `ListAgents`)

If either is missing, stop and inform the user before proceeding.

## Workflow

1. **Download transcripts** — use yt-dlp to download and clean subtitles to /tmp, then clean (strip timestamps, deduplicate lines)
2. **Delegate to `tool-transcripts`** — pass the YouTube URL(s) for analysis only (metadata, summary, takeaways, quotes, vault connections). The agent returns everything except the transcript section.
3. **Review the proposal** — present the suggested note to the user for approval or edits
4. **Assemble & write** — combine the agent's analysis with the raw cleaned transcript and write to `knowledge/memories/research/thought-leadership/<slugified-title>.md`
5. **Cleanup** — remove temp files from /tmp

## Batch Processing

For multiple videos or playlists:
- Download all transcripts in parallel via yt-dlp
- Fan out analysis to `tool-transcripts` (up to 4 in parallel)
- Present batch results for review
- Write approved notes and append raw transcripts

## Notes
- The transcript download and the analysis are split to avoid context overflow in the subagent
- For playlists, `tool-transcripts` returns one proposal per video — present them as a batch for review
- If a note already exists for the video URL, the agent will flag it — ask the user whether to update or skip
