# Eval Conventions

## Naming

### Case Files
- `cases/<agent>/<skill>.yaml` — one file per skill being tested
- `cases/<agent>/promptfooconfig.yaml` — aggregates all cases for that agent

### Assertions
- `lib/assertions/<check-name>.js` — kebab-case, descriptive verb
- Export a single function matching promptfoo's custom assertion interface

### Results
- `results/<agent>-<date>.json` — promptfoo output per run
- `results/reports/<date>-summary.md` — generated report

## Storage

```
evals/
├── cases/<agent>/
│   ├── promptfooconfig.yaml    # Main config (imports case files)
│   └── <skill>.yaml            # Case definitions per skill
├── lib/assertions/             # Code graders (JS)
├── lib/kiro-<agent>.sh         # Exec providers
├── results/                    # Raw promptfoo output (gitignored)
│   └── reports/                # Generated summaries (committed)
├── ARCHITECTURE.md             # Design and vision
├── CONVENTIONS.md              # This file
├── README.md                   # Quick start
└── run.sh                      # Entry point
```

## Adding a New Eval Case

1. Create or edit `cases/<agent>/<skill>.yaml`
2. Add the test entry with `vars`, `assert`, and `metadata`
3. Include at least one code grader (deterministic) and one model grader (workflow compliance)
4. Tag with `metadata.type: capability` or `regression`
5. Add the case to `cases/<agent>/promptfooconfig.yaml` if not auto-imported
6. Run: `bash run.sh llm <agent>` to verify

## Grader Selection Checklist

- [ ] Can I verify this with telemetry events? → `delegated-to.js` or `tool-called.js`
- [ ] Is there a structural constraint? → `no-write-tools.js` or `max-tool-calls.js`
- [ ] Do I need to evaluate reasoning quality? → `llm-rubric`
- [ ] Is this security-sensitive? → add `metadata.human_review: true`
