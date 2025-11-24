# Logging Migration Summary

## Overview

Migrated from ad-hoc `console.*` statements to structured logging using the `debug` npm package.

## Changes Made

### 1. Logger Implementation (`src-ui/src/utils/logger.ts`)

Created a minimal wrapper around the `debug` package with namespaced loggers:

- `log.context` - Context providers and state management
- `log.api` - API calls and responses  
- `log.chat` - Chat interactions and messages
- `log.workflow` - Workflow execution
- `log.plugin` - Plugin loading and registration
- `log.auth` - Authentication and authorization

### 2. Console Statement Migration

**Removed:**
- Debug logs from navigation/history tracking (ActiveChatsContext)
- Debug logs from workspace rendering (CRM, Calendar, WorkspaceRenderer)
- Debug logs from component lifecycle (Header, hooks)
- Hash tracking logs (main.tsx)

**Converted to `log.api()`:**
- All `console.error()` statements for API failures
- Error handling in contexts, hooks, views, and components

**Converted to `log.debug()`:**
- Storage warnings (sessionStorage failures)
- Plugin registry warnings
- Monitoring heartbeat warnings
- Auto-rescan notifications

### 3. Configuration

Added path alias to `vite.config.ts`:
```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src-ui/src'),
  },
}
```

### 4. Documentation

Updated:
- `README.md` - Added debugging section with usage examples
- `AGENTS.md` - Added comprehensive debugging guide with namespaces

## Usage

### Enable Logging

```javascript
// In browser console
localStorage.debug = 'app:*'  // Enable all
localStorage.debug = 'app:api,app:chat'  // Enable specific
localStorage.debug = ''  // Disable all
```

### In Code

```typescript
import { log } from '@/utils/logger';

log.api('Fetching agents');
log.debug('Cache hit:', data);
log.chat('Message sent:', message);
```

## Benefits

1. **Cleaner console** - No spam in production
2. **Selective debugging** - Enable only what you need
3. **Namespaced logs** - Easy to filter by category
4. **Industry standard** - Using battle-tested `debug` package
5. **Runtime control** - Toggle logs without code changes

## Files Modified

- 25+ context, hook, component, and view files
- All console statements replaced with appropriate log levels
- Logger imports added to all affected files
- Duplicate imports cleaned up
