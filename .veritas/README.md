# Veritas For Work-Agent

This repo is a brownfield Veritas proving ground. The previous `.ai-guidance` integration has been replaced by `.veritas` so trust metadata, policy, evidence, proof lanes, shadow feedback, and eval records use the current Veritas model.

## Proof Lanes

- `repo-governance`: required default lane for Veritas artifacts, AI instruction wiring, CI/report wiring, and pinned workflow actions.
- `repo-guardrails`: broad compatibility aggregator extracted from the old `verify:convergence` concept. It is no longer the default required lane.
- `architecture-boundaries`: candidate lane for package/import and architecture-boundary checks while catch evidence is measured.
- `ui-data-access`: candidate lane for SDK-hook/raw-fetch guidance while product tests absorb behavior checks.
- `runtime-contracts`: candidate lane for runtime/ACP/Codex source-shape checks; `connected-agents` is the behavioral proof.
- `retired-surfaces`: candidate lane for deleted-surface tombstones with explicit expiry/review requirements.
- `migration-tombstones`: advisory lane for low-severity refactor-shape tombstones that should be retired or softened.
- `static-verification`: Biome, TypeScript, and unit tests.
- `sdk-builds`: SDK and connect package builds.
- `app-builds`: server and UI builds.
- `connected-agents`: connected runtime integration tests.

The broad `repo-guardrails` lane is intentionally transitional. It protects existing behavior while equivalence is measured, but it is not the final Veritas abstraction and should not be copied into other repos. See `docs/strategy/veritas/guardrail-usefulness-inventory.md` for how old checks should be kept, converted, softened, or retired.

Proof-family metadata lives in `.veritas/proof-families/repo-guardrails.families.json` and is referenced by `.veritas/repo.adapter.json` through `evidence.proofFamilyManifests`. Veritas reports this as native `proof_family_results` and `verification_budget` evidence. The local family runner still writes sidecar evidence under `.veritas/evidence/proof-families/` for command-level details.

## Commands

```bash
npm run proof:repo-governance
npm run proof:repo-guardrails
npm run proof:architecture-boundaries
npm run veritas:report:working-tree
npm run veritas:shadow
npm run veritas:checkin:report
```

## Brownfield Rule

If Veritas does not support a real work-agent onboarding or verification need cleanly, record it in `docs/strategy/veritas/brownfield-gap-log.md` instead of hiding it in a one-off workaround.

## Promotion Rule

Do not promote a candidate or advisory family to required because it "feels safer." Promotion needs one of:

- a real regression caught by the family,
- a mutation proving normal tests miss the failure,
- repeated agent regression evidence with low false-positive noise.

Families without catch evidence stay candidate/advisory, move to product tests, or retire.
