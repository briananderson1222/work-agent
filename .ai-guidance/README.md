# AI Guidance Integration

This directory contains the `work-agent` bindings for the standalone
`ai-guidance-framework` project.

It is intentionally repo-local and tracked so the project can:
- declare its adapter shape explicitly
- own its repo-specific policy pack
- evolve together with the standalone framework without hiding the integration in `.omx/`

Current files:
- `work-agent.adapter.json` — repo adapter configuration
- `policy-packs/work-agent-convergence.policy-pack.json` — initial convergence-style policy pack
