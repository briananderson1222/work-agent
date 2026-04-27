# Veritas Evidence Retention Policy

Veritas evidence is useful for local review and CI artifacts, but generated files should not make the repository noisy.

## Commit

- `.veritas/repo.adapter.json`
- `.veritas/policy-packs/**`
- `.veritas/team/**`
- `.veritas/proof-families/**`
- `.veritas/README.md`
- curated examples explicitly referenced by docs

## Do Not Commit By Default

- `.veritas/evidence/**`
- `.veritas/eval-drafts/**`
- `.veritas/evals/**`
- `.veritas/checkins/**`

Generated evidence should be uploaded by CI or kept locally. Commit it only when it is deliberately curated as a fixture or example.

## Review Rule

If a generated artifact is needed to justify a change, cite the command and artifact path in the PR or commit message. Do not commit every local run just because Veritas produced JSON.
