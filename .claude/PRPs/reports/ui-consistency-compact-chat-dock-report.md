# Implementation Report: UI Consistency + Compact Chat Dock

## Summary
Introduced a CSS design token system (`tokens.css`) for typography and spacing, migrated all 33 CSS files to use those tokens, compacted the chat dock chrome from ~130px to ~92px, added an opt-in auto-hide feature, and eliminated inline `style={{}}` blocks from key components.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large |
| Confidence | 8/10 | 9/10 |
| Files Changed | 35 CSS + 3 TSX + 1 hook + 1 new CSS | 33 CSS + 4 TSX + 1 hook + 1 new CSS |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Create tokens.css | ✅ Complete | Added extra tokens: --text-15, --text-5xl (24px), --text-6xl (32px) |
| 2 | Import tokens + update body font | ✅ Complete | |
| 3 | Compact chat dock CSS | ✅ Complete | Also compacted history-toggle button |
| 4 | Reduce default dock height | ✅ Complete | 400 → 320px |
| 5 | Auto-hide state + timer | ✅ Complete | useCallback + useRef cleanup |
| 6 | Wire auto-hide into ChatDockHeader + ChatDock | ✅ Complete | Also moved sessions derivation before useChatDockState (required by activeSessionCount dependency) |
| 7 | Auto-hide CSS transition | ✅ Complete | display:none approach; also added .chat-dock__activity-label class |
| 8 | Replace SessionTab inline styles | ✅ Complete | |
| 9+10 | Migrate typography tokens across all CSS files | ✅ Complete | Sed-based batch migration across 33 files |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| TypeScript | ✅ Pass | Zero errors |
| Biome lint/format | ✅ Pass | Fixed formatting issues in 4 files after initial check |
| UI Tests | ✅ Pass | 63 test files, 223 tests |
| Full test suite | ⚠ 1 pre-existing failure | `lifecycle.test.ts` fails on pre-existing CLI changes (unrelated to UI) |

## Files Changed

| File | Action |
|---|---|
| `src-ui/src/tokens.css` | CREATED |
| `src-ui/src/index.css` | UPDATED — token import, body font, chat dock sizing, new CSS classes |
| `src-ui/src/hooks/useChatDockState.ts` | UPDATED — auto-hide state + timer, reduced default height |
| `src-ui/src/components/ChatDock.tsx` | UPDATED — session derivation reordered, auto-hide wiring |
| `src-ui/src/components/ChatDockHeader.tsx` | UPDATED — auto-hide toggle button, CSS class SVGs |
| `src-ui/src/components/SessionTab.tsx` | UPDATED — inline styles → CSS classes |
| All 33 `*.css` files in `src-ui/src/` | UPDATED — font-family + font-size → token variables |

## Deviations from Plan

1. **Sessions reordering in ChatDock.tsx** — Plan assumed `activeSessionCount` could be passed directly. In practice, `useDerivedSessions` was declared *after* `useChatDockState` in the component. Moved `sessions` derivation before the hook call to avoid a "used before declaration" issue.

2. **Extra tokens added** — Plan's scale covered 9px–22px. Codebase also used 15px, 24px, 32px. Added `--text-15`, `--text-5xl`, `--text-6xl` rather than leaving bare values.

3. **`chat-dock__activity-label` class** — Plan noted the inline `style` on the activity dropdown item. Added the CSS class as part of Task 7 rather than a separate task.

4. **10.5px left as-is** — Fractional value in `ProjectPage.css` has no direct token equivalent; left with comment potential for a `--text-10-5` token.

## Token Coverage

```
Font-family bare declarations remaining: 0 (only font-family: inherit)
Font-size bare declarations remaining:   1 (10.5px in ProjectPage.css — intentional)
```

## Chat Dock Size Reduction

| Element | Before | After |
|---|---|---|
| Header height (CSS var) | 55px | 38px |
| Header padding | 8px 20px | 4px 12px |
| Tab bar padding | 6px 12px | 4px 8px |
| Tab bar gap | 16px | 8px |
| Tab min-width | 180px | 140px |
| Tab font-size | 13px | 12px |
| New/Open button padding | 8px 12px | 4px 8px |
| Default dock height | 400px | 320px |

## Next Steps
- [ ] `/code-review` — review changes before committing
- [ ] `/prp-commit` or manual commit
- [ ] Manual smoke test at 768px, 1024px, 1440px viewports
- [ ] Consider adding `--text-10-5: 10.5px` for full token coverage
