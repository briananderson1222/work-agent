# Work-Agent As Veritas Proving Ground

Work-agent is the brownfield proving ground for Veritas. The goal is not to preserve every historical work-agent check. The goal is to discover which verification shapes help agents make better changes across real products.

## What Veritas Should Learn Here

- Brownfield repos need an inventory step before enforcement.
- Required checks should stay small and trust-contract focused.
- Candidate checks need owners, catch evidence, false-positive review, and review triggers before promotion.
- Product behavior belongs in normal tests selected by Veritas, not in one giant source-shape script.
- Migration tombstones need expiry so they do not become permanent architecture.
- Reports need to show verification weight, freshness, and deletion candidates, not only pass/fail.

## Work-Agent Responsibilities

- Keep repo-specific facts in `.veritas/proof-families/**` or product tests.
- Promote only reusable verification shapes upstream to Veritas.
- Treat `repo-governance` as the required default lane.
- Treat `repo-guardrails` as compatibility coverage until family lanes and product tests replace it.
- Record Veritas gaps in `docs/strategy/veritas/brownfield-gap-log.md`.

## Veritas Responsibilities

- Own the evidence/report shape for proof-family results and verification budgets.
- Keep adapters generic enough for other repos.
- Make brownfield initialization produce reviewable recommendations instead of one-shot enforcement.
- Help agents see what is required, what is candidate, and what should be deleted.

## Surface Prove-Out

Work-agent also proves that Veritas can sit on top of the broader Kontour Surface trust substrate.

The local Veritas checkout can generate a work-agent evidence artifact with embedded `surface.input`:

```bash
VERITAS_REPO=/path/to/kontourai/veritas
node "$VERITAS_REPO/bin/veritas.mjs" shadow run --working-tree --format feedback --run-id work-agent-surface-shadow
```

Surface can import the resulting artifact:

```bash
SURFACE_REPO=/path/to/kontourai/surface
node "$SURFACE_REPO/bin/surface.mjs" report --adapter veritas --input .veritas/evidence/work-agent-surface-shadow.json --format summary
```

This keeps proof lanes, proof families, and verification budgets as Veritas workflow mechanics while exposing their portable output as Surface claims, evidence, policies, and events.
