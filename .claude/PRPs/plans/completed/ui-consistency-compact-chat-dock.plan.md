# Plan: UI Consistency + Compact Chat Dock

## Summary
Introduce a CSS design token system for typography and spacing, migrate all 33+ CSS files to use those tokens, and compact the chat dock chrome from ~130px to ~75px with an optional auto-hide behavior — all without touching component logic or altering the visual design intent.

## User Story
As a user on a smaller screen, I want the UI to feel tight and consistent, so that I can see more content without the chat dock and oversized text eating my vertical space.

## Problem → Solution
- Four divergent monospace font stacks and ~1,147 scattered `font-size` declarations with no tokens → single `--font-sans`/`--font-mono` token + `--text-*` size scale
- Hardcoded `padding`/`gap` values with no shared spacing system → `--space-*` token scale
- Chat dock header + tabs consuming ~130px before any content → compact to ~75px; add opt-in auto-hide on idle

## Metadata
- **Complexity**: Large
- **Source PRD**: N/A
- **PRD Phase**: N/A
- **Estimated Files**: 35 CSS files + 3 TSX components + 1 hook + 1 new CSS file

---

## UX Design

### Before
```
┌────────────────────────────────────────────────────┐
│ ██ Chat Dock  ⚙  [2 sessions]  ↑  ✕    55px header │
├────────────────────────────────────────────────────┤
│ ☰ [Session 1 (180px min)]  [Session 2]  [Open][New]│
│                                    46px tab bar     │
├────────────────────────────────────────────────────┤
│ project context bar              ~28px             │
├────────────────────────────────────────────────────┤
│                                                    │
│            Chat content (400px default)            │
│                                                    │
└────────────────────────────────────────────────────┘
Total chrome before content: ~130px
```

### After
```
┌────────────────────────────────────────────────────┐
│ ██ Chat Dock  ⚙  [2]  ↑  ✕  [auto-hide toggle] 38px│
├────────────────────────────────────────────────────┤
│ ☰ [Session 1 (140px)]  [Session 2]  [Open][New]    │
│                                    32px tab bar     │
├────────────────────────────────────────────────────┤
│ project context bar              22px               │
├────────────────────────────────────────────────────┤
│                                                    │
│            Chat content (320px default)            │
│                                                    │
└────────────────────────────────────────────────────┘
Total chrome before content: ~92px
Auto-hide: after 5s idle → collapses to header only (38px)
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Chat dock header | 55px tall | 38px tall | Padding `8px 20px` → `4px 12px` |
| Tab bar | ~46px (pad `6px 12px`, gap `16px`) | ~32px (pad `3px 8px`, gap `8px`) | |
| Tab min-width | 180px | 140px | Still scrollable if overflow |
| New/Open buttons | `padding: 8px 12px` | `padding: 4px 8px` | Proportionally smaller |
| Default dock height | 400px | 320px | User can still drag |
| Auto-hide | N/A | Opt-in toggle in header | Collapses after 5s idle, expands on hover |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `src-ui/src/index.css` | 1–11 | `:root` where tokens will be added |
| P0 | `src-ui/src/index.css` | 909–984 | Chat dock header + tabs — exact selectors to modify |
| P0 | `src-ui/src/index.css` | 1000–1015 | `.chat-dock__tab` sizing |
| P0 | `src-ui/src/index.css` | 1237–1256 | `.chat-dock__new` button sizing |
| P0 | `src-ui/src/hooks/useChatDockState.ts` | all | Where to add auto-hide state |
| P0 | `src-ui/src/components/ChatDockHeader.tsx` | all | Where to add auto-hide toggle button |
| P1 | `src-ui/src/components/SessionTab.tsx` | 91–114 | Inline styles to extract |
| P1 | `src-ui/src/components/ChatDockTabBar.tsx` | all | Tab bar component |
| P2 | `src-ui/src/components/chat.css` | all | Font/size declarations to migrate |
| P2 | `src-ui/src/views/editor-layout.css` | all | Largest view CSS, divergent font stacks |
| P2 | `src-ui/src/views/ProjectPage.css` | all | 12× `"SF Mono"` stack |

## External Documentation
None needed — feature uses established internal patterns only.

---

## Patterns to Mirror

### EXISTING_CSS_VARIABLE_PATTERN
```css
/* SOURCE: src-ui/src/index.css:3-11 */
:root {
  --chat-dock-header-height: 55px;
  --app-toolbar-height: 46px;
}
```
→ Add `--font-*`, `--text-*`, and `--space-*` tokens to this same `:root` block.

### EXISTING_THEME_VARIABLE_PATTERN
```css
/* SOURCE: src-ui/src/index.css:13-70 */
:root,
[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --text-primary: #e0e0e0;
  /* ... */
}
[data-theme="light"] {
  --bg-primary: #ffffff;
  /* ... */
}
```
→ Font and spacing tokens go in `:root` only (not theme-specific). Color tokens stay per-theme.

### BODY_FONT_PATTERN
```css
/* SOURCE: src-ui/src/index.css:223-229 */
body {
  font-family: "DM Sans", system-ui, sans-serif;
}
button {
  font-family: inherit;
  font-size: inherit;
}
```
→ After adding token, update to `font-family: var(--font-sans)`. Buttons already inherit — no change needed.

### CSS_SELECTOR_NESTING_STYLE
```css
/* SOURCE: src-ui/src/index.css:909-943 */
.chat-dock__header {
  padding: 8px 20px;
}
.chat-dock__header-actions {
  gap: 12px;
}
```
→ All chat dock rules use flat BEM selectors. No nesting. Maintain this style.

### INLINE_STYLE_TO_CSS_CLASS
```tsx
/* SOURCE: src-ui/src/components/SessionTab.tsx:92-101 */
{modelInfo && (
  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
    {modelInfo.name || 'Custom'}
  </div>
)}
```
→ Extract to CSS class `.chat-dock__tab-model` in `src-ui/src/index.css`.

### REACT_HOOK_STATE_PATTERN
```ts
/* SOURCE: src-ui/src/hooks/useChatDockState.ts:17-22 */
const [dockHeight, setDockHeight] = useState(400);
const [dockWidth, setDockWidth] = useState(400);
const [previousDockHeight, setPreviousDockHeight] = useState(400);
```
→ New auto-hide state follows same pattern: `const [autoHideEnabled, setAutoHideEnabled] = useState(false)`.

### LOCALSTORAGE_PERSISTENCE
```ts
/* SOURCE: src-ui/src/hooks/useChatDockState.ts:25-29 */
const [chatFontSize, setChatFontSize] = useState(() => {
  const params = new URLSearchParams(window.location.search);
  const querySize = params.get('fontSize');
  return querySize ? parseInt(querySize, 10) : defaultFontSize;
});
```
→ Auto-hide persists via localStorage init: `useState(() => localStorage.getItem('chatDockAutoHide') === 'true')`.

### USEEFFECT_CSS_VAR_UPDATE
```ts
/* SOURCE: src-ui/src/hooks/useChatDockState.ts:41-65 */
useEffect(() => {
  const root = document.documentElement;
  root.style.setProperty('--chat-dock-height', `${height}px`);
}, [dockMode, dockWidth, isDockOpen, isDockMaximized, dockHeight]);
```
→ Auto-hide sets `document.documentElement.classList.toggle('chat-dock-auto-hidden', isAutoHidden)`.

### NAVIGATION_CONTEXT_USAGE
```ts
/* SOURCE: src-ui/src/components/ChatDockHeader.tsx:54-58 */
const { isDockOpen, isDockMaximized, setDockState, dockMode } = useNavigation();
```
→ Auto-hide toggle is a local hook concern; `isDockOpen` / `isDockMaximized` used for disabling auto-hide.

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src-ui/src/tokens.css` | CREATE | Design token definitions |
| `src-ui/src/index.css` | UPDATE | Import tokens; migrate chat dock CSS; add token vars to `:root` |
| `src-ui/src/components/chat.css` | UPDATE | Migrate font-family/font-size to tokens |
| `src-ui/src/views/editor-layout.css` | UPDATE | Unify 4 divergent monospace stacks |
| `src-ui/src/views/ProjectPage.css` | UPDATE | Unify 12× `"SF Mono"` stack |
| `src-ui/src/views/page-layout.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/ScheduleView.css` | UPDATE | Unify divergent monospace stacks |
| `src-ui/src/views/skills-view.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/registry-view.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/ConnectionsHub.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/MonitoringView.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/PluginManagementView.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/SettingsView.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/ProjectSettingsView.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/SortableTable.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/KnowledgeConnectionView.css` | UPDATE | Migrate font declarations |
| `src-ui/src/views/IntegrationsView.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/SplitPaneLayout.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/CodingLayout.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/ProjectSidebar.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/DetailHeader.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/ActivityTimeline.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/AgentBadge.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/OnboardingGate.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/VoiceOrb.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/VoicePill.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/InsightsDashboard.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/UsageStatsPanel.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/SortToolbar.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/PinDialog.css` | UPDATE | Migrate font declarations |
| `src-ui/src/components/ImportPromptsModal.css` | UPDATE | Migrate font declarations |
| `src-ui/src/pages/ProfilePage.css` | UPDATE | Migrate font declarations |
| `src-ui/src/pages/NotificationsPage.css` | UPDATE | Migrate font declarations |
| `src-ui/src/hooks/useChatDockState.ts` | UPDATE | Add auto-hide state + timer; reduce default heights |
| `src-ui/src/components/ChatDockHeader.tsx` | UPDATE | Add auto-hide toggle button; replace inline SVG sizes with CSS classes |
| `src-ui/src/components/SessionTab.tsx` | UPDATE | Replace 3 inline style blocks with CSS classes |

## NOT Building
- Font size changes for semantic reasons (e.g., making headers larger/smaller for aesthetic redesign)
- Dark/light theme color changes
- Any component logic changes beyond auto-hide
- Responsive breakpoint restructuring beyond minor chat dock mobile adjustments
- New font families or replacing JetBrains Mono
- Animation or transition redesigns beyond the auto-hide collapse

---

## Step-by-Step Tasks

### Task 1: Create `tokens.css`
- **ACTION**: Create `src-ui/src/tokens.css` with CSS custom properties for typography and spacing
- **IMPLEMENT**:
  ```css
  /* Typography */
  :root {
    --font-sans: "DM Sans", system-ui, sans-serif;
    --font-mono: "JetBrains Mono", "SF Mono", "Fira Code", "Cascadia Code", monospace;

    --text-2xs: 9px;
    --text-xs: 10px;
    --text-sm: 11px;
    --text-base: 12px;
    --text-md: 13px;
    --text-lg: 14px;
    --text-xl: 16px;
    --text-2xl: 18px;
    --text-3xl: 20px;
    --text-4xl: 22px;

    --leading-tight: 1.2;
    --leading-normal: 1.4;
    --leading-relaxed: 1.55;

    --weight-regular: 400;
    --weight-medium: 500;
    --weight-semibold: 600;
    --weight-bold: 700;

    /* Spacing */
    --space-1: 2px;
    --space-2: 4px;
    --space-3: 6px;
    --space-4: 8px;
    --space-5: 10px;
    --space-6: 12px;
    --space-8: 16px;
    --space-10: 20px;
    --space-12: 24px;
    --space-16: 32px;
    --space-20: 40px;

    /* Border radius */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;
    --radius-xl: 12px;
    --radius-pill: 999px;
  }
  ```
- **MIRROR**: EXISTING_CSS_VARIABLE_PATTERN — flat `:root` block
- **IMPORTS**: None — pure CSS
- **GOTCHA**: Do NOT redefine color tokens here. Colors stay in `index.css` under themed `:root`/`[data-theme]` blocks. This file is layout/type only.
- **VALIDATE**: File parses without error. `npx biome check src-ui/` passes.

### Task 2: Import tokens into `index.css` and update `body`
- **ACTION**: Add token import at top of `index.css`; update `body` font-family; add `--font-sans`/`--font-mono` to `:root` block (lines 3-11)
- **IMPLEMENT**:
  - Line 1: add `@import url("./tokens.css");` after the Google Fonts import (after line 1, before line 3)
  - `body { font-family: var(--font-sans); ... }` (line 224)
  - Add to `:root` block (line 3): `--font-sans: var(--font-sans);` — actually the tokens are already defined in tokens.css which is imported, so `body` just uses them directly
- **MIRROR**: BODY_FONT_PATTERN
- **GOTCHA**: The `@import` must be the very first statement (before `:root`). Google Fonts import is line 1, so the tokens import goes on line 2.
- **VALIDATE**: Browser renders body text unchanged. `npx tsc --noEmit` passes.

### Task 3: Compact chat dock — CSS changes in `index.css`
- **ACTION**: Reduce chat dock header height, tab bar padding, tab sizing, and new button padding
- **IMPLEMENT** (specific line-targeted changes):
  ```css
  /* Line 4: was 55px */
  --chat-dock-header-height: 38px;

  /* Line 913: was padding: 8px 20px */
  .chat-dock__header { padding: 4px 12px; }

  /* Line 927: was gap: 8px */
  .chat-dock__title { gap: var(--space-3); }  /* 6px */

  /* Line 940: was gap: 12px */
  .chat-dock__header-actions { gap: var(--space-4); }  /* 8px */

  /* Line 980: was padding: 6px 12px; gap: 16px */
  .chat-dock__tabs { padding: var(--space-2) var(--space-4); gap: var(--space-4); }  /* 4px 8px; gap 8px */

  /* Line 1004: was padding: 4px 8px */
  .chat-dock__tab { padding: var(--space-1) var(--space-3); }  /* 2px 6px */

  /* Line 1011: was min-width: 180px */
  .chat-dock__tab { min-width: 140px; }

  /* Line 1013: was font-size: 13px */
  .chat-dock__tab { font-size: var(--text-base); }  /* 12px */

  /* Line 1241: was padding: 8px 12px */
  .chat-dock__new { padding: var(--space-2) var(--space-4); }  /* 4px 8px */
  ```
  Also add new CSS classes for SessionTab inline styles (same file, after `.chat-dock__new`):
  ```css
  .chat-dock__tab-model {
    font-size: var(--text-2xs);
    color: var(--text-muted);
    font-style: italic;
    margin-top: var(--space-1);
  }
  .chat-dock__tab-shortcut {
    font-size: var(--text-xs);
    color: var(--text-muted);
    flex-shrink: 0;
  }
  ```
- **MIRROR**: CSS_SELECTOR_NESTING_STYLE (flat BEM, no nesting)
- **GOTCHA**: `--chat-dock-header-height` is read by `useChatDockState.ts` (line 50-52) via `getComputedStyle` — changing the CSS var is sufficient, no JS change needed for collapsed height.
- **VALIDATE**: Chat dock header visually ~38px. Tab bar visually ~28px. No overflow clipping.

### Task 4: Reduce default dock height in `useChatDockState.ts`
- **ACTION**: Change default `dockHeight` and `previousDockHeight` from 400 to 320
- **IMPLEMENT**:
  ```ts
  // Line 18: was useState(400)
  const [dockHeight, setDockHeight] = useState(320);
  // Line 20: was useState(400)
  const [previousDockHeight, setPreviousDockHeight] = useState(320);
  ```
- **MIRROR**: REACT_HOOK_STATE_PATTERN
- **IMPORTS**: No change
- **GOTCHA**: Only affects fresh sessions/first load. Persisted dock heights from localStorage will override. Users who previously had a 400px dock keep it — that is correct behavior.
- **VALIDATE**: Fresh app load shows dock at 320px by default.

### Task 5: Add auto-hide state and timer to `useChatDockState.ts`
- **ACTION**: Add `autoHideEnabled`, `isAutoHidden` state; add idle timer logic
- **IMPLEMENT**:
  ```ts
  // Add after existing state declarations (around line 35)
  const [autoHideEnabled, setAutoHideEnabled] = useState(
    () => localStorage.getItem('chatDockAutoHide') === 'true'
  );
  const [isAutoHidden, setIsAutoHidden] = useState(false);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist autoHideEnabled changes
  useEffect(() => {
    localStorage.setItem('chatDockAutoHide', String(autoHideEnabled));
  }, [autoHideEnabled]);

  // Auto-hide timer logic
  useEffect(() => {
    if (!autoHideEnabled || !isDockOpen || isDockMaximized) {
      setIsAutoHidden(false);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      return;
    }
    autoHideTimerRef.current = setTimeout(() => {
      setIsAutoHidden(true);
    }, 5000);
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, [autoHideEnabled, isDockOpen, isDockMaximized]);

  // Reset auto-hide on dock interaction
  const resetAutoHide = useCallback(() => {
    if (!autoHideEnabled) return;
    setIsAutoHidden(false);
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = setTimeout(() => {
      setIsAutoHidden(true);
    }, 5000);
  }, [autoHideEnabled]);
  ```
  Add `autoHideEnabled`, `setAutoHideEnabled`, `isAutoHidden`, `resetAutoHide` to the return object.
- **MIRROR**: REACT_HOOK_STATE_PATTERN, LOCALSTORAGE_PERSISTENCE, USEEFFECT_CSS_VAR_UPDATE
- **IMPORTS**: Add `useCallback, useRef` to existing React import (line 1)
- **GOTCHA**: Check for active sessions before hiding — do NOT auto-hide when any session `isSessionExecutionActive`. Import `isSessionExecutionActive` from `../utils/execution` or pass `sessions` as a parameter and check inside the hook.

  The safest approach is to accept an optional `activeSessions` count parameter and disable the timer when > 0:
  ```ts
  interface UseChatDockStateOptions {
    defaultFontSize: number;
    isDockOpen: boolean;
    isDockMaximized: boolean;
    activeSessionCount?: number;  // add this
  }
  ```
  Then in the timer effect: add `activeSessionCount === 0` condition.
- **VALIDATE**: Enable auto-hide, wait 5s with dock open → dock collapses. Mouse over dock → dock re-expands. Active session → timer does not fire.

### Task 6: Wire auto-hide into `ChatDockHeader.tsx`
- **ACTION**: Accept `autoHideEnabled`/`setAutoHideEnabled`/`isAutoHidden`/`resetAutoHide` props; apply `chat-dock--auto-hidden` class; add toggle button; replace inline SVG sizes with CSS classes
- **IMPLEMENT**:
  Add to `ChatDockHeaderProps`:
  ```ts
  autoHideEnabled: boolean;
  setAutoHideEnabled: (v: boolean) => void;
  isAutoHidden: boolean;
  resetAutoHide: () => void;
  ```
  On the root `<div>`:
  ```tsx
  <div
    className={`chat-dock__header ${isDockMaximized ? 'is-maximized' : ''} ${isDragging ? 'is-dragging' : ''} ${isAutoHidden ? 'is-auto-hidden' : ''}`}
    onMouseEnter={resetAutoHide}
    ...
  >
  ```
  Add toggle button inside `.chat-dock__header-actions`:
  ```tsx
  <button
    className={`chat-dock__icon-btn ${autoHideEnabled ? 'is-active' : ''}`}
    onClick={(e) => { e.stopPropagation(); setAutoHideEnabled(!autoHideEnabled); }}
    title={autoHideEnabled ? 'Auto-hide: on' : 'Auto-hide: off'}
  >
    <svg style={{ width: '14px', height: '14px' }} ... >
      {/* eye icon or timer icon */}
    </svg>
  </button>
  ```
  Replace inline `style={{ width: '14px', height: '14px' }}` on gear SVG (line 132) → `className="chat-dock__icon-svg"`.
  Replace inline `style={{ width: '16px', height: '16px', transform: ..., transition: ... }}` on chevron SVG (line 228) → `className="chat-dock__chevron-svg"` with a `data-direction` attribute or CSS class for rotation.

  Add to `index.css` (after `.chat-dock__header` block):
  ```css
  .chat-dock__icon-svg {
    width: 14px;
    height: 14px;
  }
  .chat-dock__chevron-svg {
    width: 14px;
    height: 14px;
    transition: transform 0.2s;
  }
  .chat-dock__chevron-svg.is-open { transform: rotate(0deg); }
  .chat-dock__chevron-svg.is-closed { transform: rotate(180deg); }
  .chat-dock__chevron-svg.is-right-open { transform: rotate(270deg); }
  .chat-dock__chevron-svg.is-right-closed { transform: rotate(90deg); }
  ```
- **MIRROR**: INLINE_STYLE_TO_CSS_CLASS, NAVIGATION_CONTEXT_USAGE
- **IMPORTS**: No new imports needed
- **GOTCHA**: The `onMouseEnter` on the header alone is insufficient — the auto-hide should also respond to mouse entering the entire `.chat-dock` container, not just the header. The header component only controls the header div, so `resetAutoHide` needs to also be passed to the parent `ChatDock.tsx` which wraps the entire dock. Read `ChatDock.tsx` before implementing.
- **VALIDATE**: Auto-hide toggle appears in header. Hovering dock cancels timer. Chevron rotates correctly in all 4 states.

### Task 7: Add auto-hide CSS transition to `index.css`
- **ACTION**: Add `.chat-dock` transition for auto-hide collapse
- **IMPLEMENT** (add near `.chat-dock__header` block):
  ```css
  /* Auto-hide transition — collapses dock body, keeps header visible */
  .chat-dock.is-auto-hidden .chat-dock__tabs,
  .chat-dock.is-auto-hidden .chat-dock__body {
    display: none;
  }
  ```
  Note: use `display: none` rather than `transform` to avoid layout reflow issues with the resize handle. The header stays visible so users can click to restore.

  The `is-auto-hidden` class is toggled on the `.chat-dock` element — this is the parent in `ChatDock.tsx`. Pass `isAutoHidden` as a prop to `ChatDock.tsx` and apply the class there.
- **MIRROR**: CSS_SELECTOR_NESTING_STYLE
- **GOTCHA**: In right-dock mode, auto-hide hides the body differently. Add a separate rule: `.app__main--dock-right .chat-dock.is-auto-hidden .chat-dock__tabs { display: none; }` if needed. Test in both modes.
- **VALIDATE**: When `isAutoHidden` is true, tabs and body disappear. Header remains. Clicking header re-opens.

### Task 8: Replace inline styles in `SessionTab.tsx`
- **ACTION**: Replace 3 inline style objects with CSS class names
- **IMPLEMENT**:
  ```tsx
  // Line 74: was style={{ flex: 1, minWidth: 0 }}
  <div className="chat-dock__tab-content">

  // Lines 92-101: was style={{ fontSize: '9px', color: '...', ... }}
  <div className="chat-dock__tab-model">

  // Lines 104-113: was style={{ fontSize: '10px', color: '...', flexShrink: 0 }}
  <span className="chat-dock__tab-shortcut">

  // Line 131: was style={{ flexShrink: 0 }}
  // (close button) — add to existing class or new modifier
  ```
  Add to `index.css`:
  ```css
  .chat-dock__tab-content {
    flex: 1;
    min-width: 0;
  }
  .chat-dock__tab-model {
    font-size: var(--text-2xs);
    color: var(--text-muted);
    font-style: italic;
    margin-top: var(--space-1);
  }
  .chat-dock__tab-shortcut {
    font-size: var(--text-xs);
    color: var(--text-muted);
    flex-shrink: 0;
  }
  ```
- **MIRROR**: INLINE_STYLE_TO_CSS_CLASS
- **IMPORTS**: No change
- **GOTCHA**: `AgentIcon` on line 72 has `style={{ marginRight: '8px' }}` — this is a prop on a child component. Leave it as-is unless `AgentIcon` accepts a className prop. Don't over-scope.
- **VALIDATE**: `SessionTab` renders identically. No TypeScript errors. `npx biome check` passes.

### Task 9: Migrate typography in `index.css`
- **ACTION**: Replace all bare `font-family` and `font-size` declarations in `index.css` with token variables
- **IMPLEMENT**: Use find-replace with selector context (not global). Key mappings:
  - `font-family: "DM Sans", system-ui, sans-serif` → `font-family: var(--font-sans)`
  - `font-family: "JetBrains Mono", monospace` → `font-family: var(--font-mono)`
  - `font-size: 9px` → `font-size: var(--text-2xs)`
  - `font-size: 10px` → `font-size: var(--text-xs)`
  - `font-size: 11px` → `font-size: var(--text-sm)`
  - `font-size: 12px` → `font-size: var(--text-base)`
  - `font-size: 13px` → `font-size: var(--text-md)`
  - `font-size: 14px` → `font-size: var(--text-lg)`
  - `font-size: 16px` → `font-size: var(--text-xl)`
  - `font-size: 18px` → `font-size: var(--text-2xl)`
  - `font-size: 20px` → `font-size: var(--text-3xl)`
  - `font-size: 22px` → `font-size: var(--text-4xl)`
- **MIRROR**: BODY_FONT_PATTERN
- **GOTCHA**: Do NOT replace values inside the `@import` line or the `:root` token definition block itself. Do NOT replace `font-size` values that are intentional outliers (e.g., `font-size: 8px` for micro labels — add an `--text-micro: 8px` token if needed, or leave with a comment). Skip `rem` and `em` values — map them only if they unambiguously match a pixel token.
- **VALIDATE**: Grep for remaining bare `font-family:` (excluding `var(--font-` and Google Fonts import). Result should be 0.

### Task 10: Migrate typography in all other CSS files
- **ACTION**: Apply same token mappings as Task 9 to all 32 remaining CSS files
- **IMPLEMENT**: For each file, search for `font-family:` and `font-size:` and apply the same substitution table from Task 9. Special cases:
  - `editor-layout.css`: replace all 4 divergent monospace stacks (`"JetBrains Mono", "Fira Code"`, `"SF Mono", "Fira Code", "Cascadia Code"`, etc.) with `var(--font-mono)`
  - `ProjectPage.css`: replace all 12× `"SF Mono", "Fira Code", "JetBrains Mono", monospace` with `var(--font-mono)`
  - `ScheduleView.css`: replace `"JetBrains Mono", "SF Mono", monospace` with `var(--font-mono)`
  - `CodingLayout.css`: terminal emulator fonts — check if custom, preserve if intentional. If it's `"JetBrains Mono"`, migrate. If it has a fallback to a terminal-specific font for a reason, leave a comment.
- **MIRROR**: BODY_FONT_PATTERN
- **GOTCHA**: Work file by file. After each file: run `npx biome check src-ui/` to catch issues early.
- **VALIDATE**: `grep -r "font-family:" src-ui/src --include="*.css" | grep -v "var(--font-" | grep -v "@import" | grep -v "tokens.css"` returns 0 results.

---

## Testing Strategy

### Unit Tests
No unit tests exist for CSS. The existing `npm test` suite covers component logic and must remain green throughout.

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| Auto-hide timer fires | `autoHideEnabled=true`, wait 5s | `isAutoHidden` becomes true | No |
| Active session blocks hide | `autoHideEnabled=true`, `activeSessionCount=1` | Timer does not fire | Yes |
| Mouse enter resets timer | `isAutoHidden=true`, mouseEnter | `isAutoHidden=false` | No |
| Maximized blocks hide | `autoHideEnabled=true`, `isDockMaximized=true` | Timer does not fire | Yes |
| LocalStorage persists | Set `autoHideEnabled=true`, reload | State restored as true | No |

### Edge Cases Checklist
- [ ] Auto-hide with 0 sessions (dock is empty)
- [ ] Auto-hide in right-dock mode
- [ ] Auto-hide in maximized mode (should be disabled)
- [ ] Active streaming session prevents auto-hide
- [ ] Keyboard shortcut `dock.toggle` while auto-hidden
- [ ] Mobile viewport — auto-hide touch behavior

---

## Validation Commands

### Static Analysis
```bash
npx tsc --noEmit
```
EXPECT: Zero type errors

### Lint
```bash
npx biome check src-ui/ src-server/ packages/
```
EXPECT: No lint or format errors

### Unit Tests
```bash
npm test
```
EXPECT: All tests pass, no regressions

### Token Coverage Check
```bash
grep -r "font-family:" src-ui/src --include="*.css" | grep -v "var(--font-" | grep -v "@import" | grep -v "tokens.css"
```
EXPECT: 0 results

```bash
grep -r "font-size:" src-ui/src --include="*.css" | grep -v "var(--text-" | grep -v "tokens.css" | wc -l
```
EXPECT: < 10 (acceptable outliers: `calc()` expressions, `clamp()`, intentional one-offs)

### Browser Validation
```bash
./stallion start --instance=agent-smoke --temp-home --clean --force --port=3242 --ui-port=5274
```
Then visually verify at http://localhost:5274 at 768px, 1024px, 1440px:
- [ ] Chat dock header is ~38px
- [ ] Tab bar is compact
- [ ] Auto-hide toggle appears in header
- [ ] Auto-hide collapses dock after 5s idle
- [ ] Hover re-expands
- [ ] Right-dock mode works
- [ ] Maximized mode works
- [ ] Fonts look consistent across views

---

## Acceptance Criteria
- [ ] All tasks completed
- [ ] `npx tsc --noEmit` passes
- [ ] `npx biome check src-ui/ src-server/ packages/` passes
- [ ] `npm test` passes
- [ ] Token coverage grep returns 0 bare `font-family:` declarations
- [ ] Chat dock header ≤ 38px
- [ ] Auto-hide works in bottom and right dock modes
- [ ] Auto-hide disabled during active streaming
- [ ] No inline `fontSize`/`fontFamily` styles in SessionTab, ChatDockHeader
- [ ] Visual smoke test at 3 viewport sizes passes

## Completion Checklist
- [ ] New CSS classes follow BEM naming (`.chat-dock__tab-model`, not `.tab-model`)
- [ ] No hardcoded pixel values in new code — all use tokens
- [ ] Auto-hide uses localStorage key `chatDockAutoHide`
- [ ] Timer ref properly cleaned up in `useEffect` return
- [ ] `activeSessionCount` guard prevents auto-hide during streaming
- [ ] `ChatDock.tsx` receives and applies `isAutoHidden` class
- [ ] No unnecessary scope additions (no color redesign, no new font families)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Monospace font glyph change for SF Mono users | Low | Low | JetBrains Mono is imported via Google Fonts; renders identically for most users |
| Auto-hide conflicts with drag-resize | Medium | Medium | Disable timer while `isDragging` is true |
| `index.css` 5,628-line scope causes merge conflicts | High | Medium | Phase work in separate commits; rebase early |
| rem→px token mapping creates sub-pixel rounding differences | Low | Low | Use exact px values in tokens to match current output |
| Right-dock auto-hide hides content incorrectly | Medium | Medium | Test right-dock mode explicitly; add mode-specific CSS if needed |

## Notes
- The `ChatDock.tsx` component (not yet read) wraps the header, tab bar, and body. It is the correct place to apply `is-auto-hidden` class and `onMouseEnter={resetAutoHide}`. Read it before implementing Tasks 6-7.
- The history toggle button (`.chat-dock__history-toggle`) at line 3366 also has large padding (`8px 12px`). Consider reducing to `4px 8px` in the same pass as Task 3.
- Line heights are mostly inherited from `body` (1.4 set in `button` rule). No global `line-height` token needed unless views override it — check during Task 9.
- Spacing tokens (Task 1) are defined but Tasks 3-8 only apply them to the chat dock. Full spacing migration across all views is documented in the planner analysis but is **optional scope** for this plan — do it if time allows, but don't block shipping the font + dock work on it.
