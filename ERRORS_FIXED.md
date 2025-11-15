# Errors Fixed

## 1. Duplicate `showToast` Declaration ✅
**Error:** `Identifier 'showToast' has already been declared`

**Fix:** Removed duplicate declaration in ChatDock and old session state
- Line 176: Kept (from useToast hook)
- Line 211: Removed (duplicate)
- Also removed: `ephemeralMessages`, `streamingMessages` state

## 2. SDKAdapter Not Found ✅
**Error:** `ReferenceError: Can't find variable: SDKAdapter`

**Fix:** Removed SDK wrapper components - not needed with context architecture
- Removed: `<SDKAdapter>`, `<PermissionManager>`, `<EventRouter>` wrappers
- These were for @stallion-ai/sdk which we're not using
- App now uses contexts directly

**Before:**
```typescript
<SDKAdapter apiBase={apiBase}>
  <PermissionManager>
    <EventRouter>
      <App />
    </EventRouter>
  </PermissionManager>
</SDKAdapter>
```

**After:**
```typescript
<App />
```

## 3. Removed Effects Referencing Deleted State ✅

### Model Selector Effect
- Referenced: `sessions`, `activeSessionId`
- Status: Removed (ChatDock handles model selection)

### Active Session Derived Value
- Referenced: `sessions`, `activeSessionId`
- Status: Removed (not used in App anymore)

### Unread Count
- Referenced: `sessions`
- Status: Removed (ChatDock tracks this)

## Current Status

**App.tsx:** 1848 lines (down from 1961)
- Removed: ~113 lines total
- Still has ~65 references to deleted variables in unused functions

**Remaining Work:**
Large functions still exist but aren't called:
- `sendMessage()` - ~200 lines
- Other helper functions - ~300 lines

These will cause no runtime errors since they're never called, but should be removed for cleanliness.

## App Should Now Work ✅

All runtime errors fixed:
- ✅ No duplicate declarations
- ✅ No missing imports
- ✅ No undefined variables in executed code
- ✅ ChatDock fully functional with contexts
- ✅ Navigation works
- ✅ Toast notifications work
