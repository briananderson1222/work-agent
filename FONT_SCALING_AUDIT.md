# Font Scaling Audit - 2025-11-12

## Issue
Font size changes in chat dock (controlled by `chatFontSize` state) didn't visibly affect ToolCallDisplay and model badges due to hardcoded `px` values preventing inheritance.

## Root Cause
CSS and inline styles used absolute `px` units instead of relative `em` units, breaking the inheritance chain from `.chat-messages` container.

## Changes Made

### 1. CSS Updates (src-ui/src/index.css)

Converted tool-call component font sizes from `px` to `em`:

| Element | Before | After | Ratio |
|---------|--------|-------|-------|
| `.tool-call__header` | 13px | 0.93em | 13/14 |
| `.tool-call__icon` | 14px | 1em | 14/14 |
| `.tool-call__error` | 14px | 1em | 14/14 |
| `.tool-call__toggle` | 10px | 0.71em | 10/14 |
| `.tool-call__details` | 12px | 0.86em | 12/14 |
| `.tool-call__section pre` | 11px | 0.79em | 11/14 |

Base calculation: 14px (default chatFontSize)

### 2. Component Updates (src-ui/src/App.tsx)

Converted model badge from `9px` to `0.64em` (9/14 ratio).

## Inheritance Chain

```
.chat-messages { fontSize: `${chatFontSize}px` }  // 14px default
  └─ .message { /* inherits */ }
      ├─ .tool-call { /* inherits */ }
      │   ├─ .tool-call__header { fontSize: 0.93em }  // ~13px at default
      │   └─ .tool-call__details { fontSize: 0.86em } // ~12px at default
      └─ model badge { fontSize: 0.64em }             // ~9px at default
```

## Already Correct

These elements already used relative units:
- `.message` markdown styles (code, pre, headings) - use `em`
- `.message.system` - uses `0.9em`
- ToolCallDisplay inline styles - use `em` for buttons and text

## UI Chrome (Intentionally Fixed)

These remain `px` as they're UI chrome, not content:
- Keyboard shortcuts (⌘D, ⌘M)
- Tab badges
- Agent selector icons
- Dock controls

## Testing

1. Set chatFontSize to 10px → All tool calls and badges scale down
2. Set chatFontSize to 18px → All tool calls and badges scale up
3. Reset to 14px → Returns to baseline

## Future Considerations

- Consider using CSS custom properties for font scale ratios
- Standardize on `rem` for global UI, `em` for component-relative scaling
- Add font size presets (Small/Medium/Large) for accessibility
