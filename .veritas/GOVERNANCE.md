# Veritas Governance Surface

Work-agent uses Veritas as its brownfield trust surface.

Zone 1 is human-owned and should not be weakened without review:

- `.veritas/repo.adapter.json`
- `.veritas/policy-packs/`
- `.veritas/team/`
- `AGENTS.md`
- `CLAUDE.md`

Zone 2 is additive policy growth. Agents may add:

- new surface nodes for real repo boundaries,
- new proof lanes for independently runnable validation,
- advisory or recommend-stage policy rules,
- brownfield gap-log entries when Veritas lacks a useful abstraction.

Zone 3 is generated output:

- `.veritas/evidence/`
- `.veritas/eval-drafts/`
- `.veritas/evals/`
- `.veritas/checkins/`

Do not recreate `.ai-guidance` or `vendor/ai-guidance-framework`. Missing migration capability should be captured as a Veritas product gap instead.
