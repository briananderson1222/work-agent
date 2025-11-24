# Comprehensive Status Report: Plugin Separation Branch

**Date**: November 17, 2025  
**Branch**: `feature/plugin-separation`  
**Status**: ⚠️ **INCOMPLETE - Significant Work Divergence**

---

## Executive Summary

The plugin separation refactor is **partially complete** with a **critical issue**: the active workspace code in this repo has diverged significantly from the external plugin repository. You have ~3,100 lines of enhanced workspace code that exists only in this repo, while the external plugin repo contains simplified 634/620-line versions.

**Key Problem**: After installing the plugin via CLI, substantial development continued on the installed files, creating a **one-way sync problem**.

---

## 1. Git History & Timeline

### Branch Creation
- **Created**: November 16, 2025
- **Base Commits**:
  - `c7f7296` - "feat: plugin architecture foundation" (added CLI, SDK, PluginRegistry, docs)
  - `8f1ab17` - "docs: add context prompt and plugin structure guide"

### What Was Implemented
- Complete CLI tool for plugin management
- Enhanced @stallion-ai/sdk with 15+ hooks
- PluginRegistry with Vite glob imports
- Comprehensive documentation (5 new docs)
- Example minimal-workspace plugin

### Uncommitted Changes (19 files)
**SDK Package (4 files)**:
- `packages/sdk/src/api.ts` - Added `transformTool()` function
- `packages/sdk/src/hooks.ts` - Enhanced hooks
- `packages/sdk/src/index.ts` - Updated exports
- `packages/sdk/src/providers.tsx` - Provider updates

**UI Core (8 files)**:
- `src-ui/src/components/FileAttachmentInput.tsx`
- `src-ui/src/contexts/NavigationContext.tsx`
- `src-ui/src/core/SDKAdapter.tsx`
- `src-ui/src/index.css`
- `src-ui/src/main.tsx`
- `src-ui/src/views/SettingsView.tsx`
- `src-ui/src/views/WorkspaceView.tsx`
- `src-ui/src/workspaces/index.tsx`

**Plugin Files (5 files)**:
- `src-ui/src/plugins/sa-dashboard/index.tsx` - Changed to use local mock hooks
- `src-ui/src/plugins/sa-dashboard/plugin.json`
- `src-ui/src/plugins/sfdc-account-manager/index.tsx`
- `src-ui/src/plugins/sfdc-account-manager/plugin.json`
- `src-ui/src/plugins/shared/workspace.css`

**Other**:
- `.amazonq/cli-agents/work-agent.json`
- `package-lock.json`

---

## 2. CLI Plugin Tool Analysis

### Location
`src-server/cli-plugin.ts` (337 lines)

### Functionality
✅ **Fully Implemented**:
- `work-agent plugin install <source>` - Install from git or local path
- `work-agent plugin list` - List installed plugins
- `work-agent plugin remove <name>` - Remove plugin and all files
- `work-agent plugin info <name>` - Show plugin details

### Installation Process
1. Clones/copies plugin source to `.work-agent/plugins/<name>/`
2. Reads `plugin.json` manifest
3. Copies agents to `.work-agent/agents/<name>:<slug>/` (with namespace)
4. Copies workspace config to `.work-agent/workspaces/<slug>/`
5. Copies UI components to `src-ui/src/workspaces/<name>/`
6. Copies `plugin.json` to UI directory

### Key Insight
**The CLI tool does NOT have an "update" or "sync" mechanism**. Once installed, files are static copies. Any changes to the plugin source require manual re-installation.

---

## 3. Plugin Installation State

### Installed Plugin
**Name**: `work-workspace` (installed from `../work-agent-plugins`)

**Installation Locations**:
```
.work-agent/plugins/work-workspace/          # Source copy (634/620 lines)
.work-agent/agents/stallion-workspace:work-agent/  # Agent definition
.work-agent/workspaces/stallion/             # Workspace config
src-ui/src/workspaces/stallion-workspace/    # Active UI components (2074/1035 lines)
```

### File Size Comparison

| Location | Calendar | CRM | Status |
|----------|----------|-----|--------|
| **External Repo** (`../work-agent-plugins`) | 634 lines | 620 lines | ✅ Matches plugin source |
| **Plugin Cache** (`.work-agent/plugins/`) | 634 lines | 620 lines | ✅ Matches plugin source |
| **Simple Versions** (`*.simple` files) | 672 lines | 621 lines | ⚠️ Close but modified |
| **Active Workspace** (`src-ui/src/workspaces/stallion-workspace/`) | **2,074 lines** | **1,035 lines** | ❌ **3x larger - heavily modified** |

### Critical Finding
The active workspace has **3,109 lines** of code vs **1,254 lines** in the plugin source. This represents:
- **+1,440 lines** in Calendar.tsx (227% increase)
- **+415 lines** in CRM.tsx (167% increase)

---

## 4. Code Divergence Analysis

### What Changed After Installation

**Calendar.tsx Enhancements**:
- Advanced caching strategies
- Complex event filtering and grouping
- Enhanced UI components and interactions
- Additional data transformations
- More sophisticated error handling

**CRM.tsx Enhancements**:
- Extended Salesforce integration
- Additional data views and filters
- Enhanced account/opportunity management
- More complex state management

### Plugin vs Core Confusion

**Old Plugin Files** (`src-ui/src/plugins/`):
- `sa-dashboard/index.tsx` - 2,234 lines (OLD, pre-separation)
- `sfdc-account-manager/index.tsx` - Modified
- These are **NOT** being used by the new plugin system
- Modified to use local `hooks.ts` (mock SDK) instead of real SDK

**New Plugin Files** (`src-ui/src/workspaces/stallion-workspace/`):
- `Calendar.tsx` - 2,074 lines (ACTIVE, post-installation development)
- `CRM.tsx` - 1,035 lines (ACTIVE, post-installation development)
- These ARE being used via direct import in `workspaces/index.tsx`

---

## 5. Architecture Integration Status

### PluginRegistry
**Location**: `src-ui/src/core/PluginRegistry.ts`

**Status**: ✅ Implemented but **NOT FULLY UTILIZED**

**How It Works**:
- Uses Vite glob imports: `import.meta.glob('/src/workspaces/*/plugin.json')`
- Discovers plugins at build time
- Validates manifests
- Dynamically loads components

**Current Problem**:
`src-ui/src/workspaces/index.tsx` has **HARDCODED IMPORTS**:
```typescript
import { Calendar, CRM } from './stallion-workspace';

const coreRegistry: Record<string, AgentWorkspaceComponent> = {
  'stallion-workspace-calendar': Calendar,  // ❌ Hardcoded
  'stallion-workspace-crm': CRM,            // ❌ Hardcoded
  // ... other core components
};
```

The PluginRegistry is only checked as a **fallback**, not the primary source.

### SDK Integration
**Status**: ⚠️ **PARTIALLY INTEGRATED**

**What's Done**:
- SDK package enhanced with comprehensive hooks
- SDKProvider created
- Types exported

**What's Missing**:
- Core app doesn't wrap with SDKProvider
- Plugins use direct context imports instead of SDK hooks
- `sa-dashboard/index.tsx` uses **mock hooks** instead of real SDK

---

## 6. External Repository State

### Location
`../work-agent-plugins/`

### Structure
```
work-agent-plugins/
├── README.md
└── packages/
    └── work-workspace/
        ├── plugin.json
        ├── workspace.json
        ├── package.json
        ├── agents/
        │   └── work-agent/
        └── src/
            ├── index.tsx (275 bytes)
            ├── Calendar.tsx (634 lines)
            └── CRM.tsx (620 lines)
```

### Git History (3 commits)
1. `dacad8c` - "Initial stallion-workspace plugin with flexible agent architecture"
2. `31f7ddf` - "Add full Calendar and CRM functionality with caching, filtering, and Salesforce integration"
3. `12e146b` - "Fix Calendar and CRM components with proper API calls and full functionality matching originals"

### Uncommitted Changes
- `plugin.json` - 1 modified file

### Key Insight
The external repo was created and received 3 commits on Nov 16, but **stopped receiving updates** after the initial migration. All subsequent development happened in this repo's installed workspace files.

---

## 7. What the Install Process Does

### Step-by-Step Flow

1. **User runs**: `work-agent plugin install ../work-agent-plugins/packages/work-workspace`

2. **CLI copies files**:
   ```
   ../work-agent-plugins/packages/work-workspace/
   └─> .work-agent/plugins/work-workspace/  (full copy)
   
   agents/work-agent/agent.json
   └─> .work-agent/agents/stallion-workspace:work-agent/agent.json
   
   workspace.json
   └─> .work-agent/workspaces/stallion/workspace.json
   
   src/*
   └─> src-ui/src/workspaces/stallion-workspace/
   
   plugin.json
   └─> src-ui/src/workspaces/stallion-workspace/plugin.json
   ```

3. **Files become static copies** - No link to source, no auto-update

4. **Developer modifies installed files** - Changes accumulate in this repo

5. **External repo becomes stale** - No mechanism to sync changes back

---

## 8. Untracked Files

### New Directories
- `.work-agent/agents/stallion-workspace:work-agent/` - Installed agent
- `.work-agent/plugins/` - Plugin cache directory
- `.work-agent/workspaces/stallion/` - Installed workspace config
- `packages/sdk/package-lock.json` - SDK package lock
- `refactor` - 76MB file (unknown purpose)
- `test-plugin.mjs` - Test script

---

## 9. What's Left to Do

### Critical Path Issues

#### Issue #1: Code Sync Problem
**Problem**: 3,109 lines of enhanced code exists only in this repo  
**Impact**: External plugin repo is outdated and incomplete  
**Decision Required**: Which version is the "source of truth"?

#### Issue #2: Hardcoded Imports
**Problem**: `workspaces/index.tsx` directly imports stallion-workspace components  
**Impact**: PluginRegistry is bypassed, defeating the plugin architecture  
**Fix Required**: Remove hardcoded imports, use PluginRegistry exclusively

#### Issue #3: SDK Not Integrated
**Problem**: Core app doesn't use SDKProvider, plugins use direct imports  
**Impact**: SDK hooks don't work, plugins can't be truly independent  
**Fix Required**: Wrap app with SDKProvider, update all plugin imports

#### Issue #4: Old Plugin Files
**Problem**: `src-ui/src/plugins/sa-dashboard/` still exists with mock hooks  
**Impact**: Confusion about which files are active, dead code  
**Fix Required**: Delete old plugin directory or migrate to new system

#### Issue #5: No Update Mechanism
**Problem**: CLI has install/remove but no update/sync  
**Impact**: Can't propagate changes from external repo to installed plugins  
**Fix Required**: Add `work-agent plugin update <name>` command

---

## 10. Recommendations

### Option A: Complete the Separation (Recommended)

**Goal**: Finish what was started - true plugin separation

**Steps**:
1. **Sync code back to external repo**
   - Copy enhanced Calendar.tsx (2,074 lines) to `work-agent-plugins`
   - Copy enhanced CRM.tsx (1,035 lines) to `work-agent-plugins`
   - Commit and push to external repo

2. **Remove hardcoded imports**
   - Delete direct imports in `workspaces/index.tsx`
   - Remove stallion-workspace from `coreRegistry`
   - Let PluginRegistry handle all plugin loading

3. **Integrate SDK properly**
   - Wrap App with SDKProvider in `main.tsx`
   - Update all plugin components to use SDK hooks
   - Remove direct context imports from plugins

4. **Clean up old files**
   - Delete `src-ui/src/plugins/sa-dashboard/`
   - Delete `src-ui/src/plugins/sfdc-account-manager/`
   - Remove from git tracking

5. **Add update command**
   - Implement `work-agent plugin update <name>` in CLI
   - Add version checking
   - Handle file conflicts

6. **Test the flow**
   - Remove installed plugin: `work-agent plugin remove work-workspace`
   - Reinstall from external repo: `work-agent plugin install ../work-agent-plugins/packages/work-workspace`
   - Verify PluginRegistry discovers and loads components
   - Test SDK hooks work correctly

**Pros**:
- Achieves original goal of plugin separation
- External plugins can be distributed independently
- Clean architecture boundaries
- Reusable for future plugins

**Cons**:
- Most work required
- Risk of breaking existing functionality
- Need to test thoroughly

**Estimated Effort**: 2-3 days

---

### Option B: Keep Plugins Internal

**Goal**: Abandon external repo, keep plugins in this repo

**Steps**:
1. **Delete external repo**
   - Remove `../work-agent-plugins/`
   - No longer needed

2. **Move plugins to permanent location**
   - Keep `src-ui/src/workspaces/stallion-workspace/` as-is
   - Update documentation to reflect internal plugins

3. **Simplify architecture**
   - Remove CLI plugin tool (or keep for future use)
   - Remove PluginRegistry (or keep for future use)
   - Keep direct imports in `workspaces/index.tsx`

4. **Clean up**
   - Delete `.work-agent/plugins/` directory
   - Delete old `src-ui/src/plugins/` directory
   - Update README to remove plugin installation instructions

5. **Commit current state**
   - Commit all 19 modified files
   - Merge branch to main

**Pros**:
- Fastest path to stability
- No sync issues
- Simpler architecture
- All code in one repo

**Cons**:
- Loses plugin separation benefits
- Can't distribute workspaces independently
- Harder to maintain workspace boundaries
- Wastes the plugin architecture work

**Estimated Effort**: 1 day

---

### Option C: Hybrid Approach

**Goal**: Keep core plugins internal, support external plugins later

**Steps**:
1. **Designate stallion-workspace as "core"**
   - Move to `src-ui/src/workspaces/core/stallion-workspace/`
   - Keep hardcoded imports for core workspaces
   - Document as "built-in workspace"

2. **Keep plugin system for future**
   - Preserve CLI tool
   - Preserve PluginRegistry
   - Document as "for third-party plugins"

3. **Sync external repo for reference**
   - Copy current code to external repo
   - Mark as "reference implementation"
   - Don't use for installation

4. **Integrate SDK for future plugins**
   - Add SDKProvider to app
   - Update documentation for plugin developers
   - Core workspaces can use direct imports

**Pros**:
- Balances pragmatism with future flexibility
- Keeps plugin system for later use
- No immediate breaking changes
- Clear distinction between core and plugins

**Cons**:
- Two different patterns (core vs plugins)
- Potential confusion
- Still need to maintain plugin system

**Estimated Effort**: 1-2 days

---

## 11. Detailed Checklist

### If Choosing Option A (Complete Separation)

#### Phase 1: Sync External Repo
- [ ] Copy `src-ui/src/workspaces/stallion-workspace/Calendar.tsx` to `work-agent-plugins/packages/work-workspace/src/Calendar.tsx`
- [ ] Copy `src-ui/src/workspaces/stallion-workspace/CRM.tsx` to `work-agent-plugins/packages/work-workspace/src/CRM.tsx`
- [ ] Copy `src-ui/src/workspaces/stallion-workspace/hooks.ts` to `work-agent-plugins/packages/work-workspace/src/hooks.ts`
- [ ] Update `work-agent-plugins/packages/work-workspace/plugin.json` if needed
- [ ] Commit and push to external repo
- [ ] Tag release: `git tag v1.0.0`

#### Phase 2: Remove Hardcoded Imports
- [ ] Edit `src-ui/src/workspaces/index.tsx`
- [ ] Remove `import { Calendar, CRM } from './stallion-workspace'`
- [ ] Remove `'stallion-workspace-calendar': Calendar` from `coreRegistry`
- [ ] Remove `'stallion-workspace-crm': CRM` from `coreRegistry`
- [ ] Test that PluginRegistry fallback works

#### Phase 3: Integrate SDK
- [ ] Edit `src-ui/src/main.tsx`
- [ ] Import SDKProvider from `@stallion-ai/sdk`
- [ ] Create SDK value object with all contexts
- [ ] Wrap `<App />` with `<SDKProvider value={sdkValue}>`
- [ ] Update `Calendar.tsx` to use SDK hooks instead of direct imports
- [ ] Update `CRM.tsx` to use SDK hooks instead of direct imports
- [ ] Test all SDK hooks work correctly

#### Phase 4: Clean Up Old Files
- [ ] Delete `src-ui/src/plugins/sa-dashboard/`
- [ ] Delete `src-ui/src/plugins/sfdc-account-manager/`
- [ ] Delete `src-ui/src/plugins/shared/`
- [ ] Remove from `.gitignore` if needed
- [ ] Update `src-ui/src/workspaces/SADashboard.tsx` (if still used)

#### Phase 5: Add Update Command
- [ ] Edit `src-server/cli-plugin.ts`
- [ ] Add `update(name: string)` method
- [ ] Implement version checking
- [ ] Handle file conflicts (prompt user or backup)
- [ ] Add to CLI switch statement
- [ ] Test update flow

#### Phase 6: Reinstall and Test
- [ ] Run `work-agent plugin remove work-workspace`
- [ ] Verify all files deleted
- [ ] Run `work-agent plugin install ../work-agent-plugins/packages/work-workspace`
- [ ] Verify files copied correctly
- [ ] Start dev server: `npm run dev:ui`
- [ ] Test Calendar workspace loads
- [ ] Test CRM workspace loads
- [ ] Test SDK hooks work
- [ ] Test agent switching
- [ ] Test chat integration

#### Phase 7: Documentation
- [ ] Update README.md with plugin installation instructions
- [ ] Update PLUGIN_ARCHITECTURE.md with final architecture
- [ ] Update AGENTS.md with plugin development guide
- [ ] Create PLUGIN_DEVELOPMENT.md tutorial
- [ ] Add troubleshooting section
- [ ] Document update process

#### Phase 8: Commit and Merge
- [ ] Commit all changes with descriptive message
- [ ] Push branch to remote
- [ ] Create pull request
- [ ] Review changes
- [ ] Merge to main
- [ ] Delete feature branch

---

### If Choosing Option B (Keep Internal)

#### Phase 1: Clean Up External Repo
- [ ] Backup `../work-agent-plugins/` if needed
- [ ] Delete `../work-agent-plugins/` directory
- [ ] Remove from git tracking

#### Phase 2: Consolidate Plugin Files
- [ ] Keep `src-ui/src/workspaces/stallion-workspace/` as-is
- [ ] Delete `.work-agent/plugins/` directory
- [ ] Delete `src-ui/src/plugins/sa-dashboard/`
- [ ] Delete `src-ui/src/plugins/sfdc-account-manager/`
- [ ] Delete `src-ui/src/plugins/shared/`

#### Phase 3: Update Documentation
- [ ] Update README.md - remove plugin installation section
- [ ] Update PLUGIN_ARCHITECTURE.md - mark as "future work"
- [ ] Update AGENTS.md - remove plugin references
- [ ] Add note about internal workspaces

#### Phase 4: Simplify Architecture (Optional)
- [ ] Consider removing `src-server/cli-plugin.ts` (or keep for future)
- [ ] Consider removing `src-ui/src/core/PluginRegistry.ts` (or keep for future)
- [ ] Update `.gitignore` to remove plugin-related entries

#### Phase 5: Commit and Merge
- [ ] Commit all 19 modified files
- [ ] Add commit message explaining decision
- [ ] Push branch to remote
- [ ] Create pull request
- [ ] Merge to main
- [ ] Delete feature branch

---

### If Choosing Option C (Hybrid)

#### Phase 1: Reorganize Core Workspaces
- [ ] Create `src-ui/src/workspaces/core/` directory
- [ ] Move `stallion-workspace/` to `core/stallion-workspace/`
- [ ] Update imports in `workspaces/index.tsx`
- [ ] Test that workspaces still load

#### Phase 2: Sync External Repo
- [ ] Copy current code to `work-agent-plugins`
- [ ] Add README noting it's a reference implementation
- [ ] Commit and push
- [ ] Tag as `v1.0.0-reference`

#### Phase 3: Document Architecture
- [ ] Update README.md with core vs plugin distinction
- [ ] Update PLUGIN_ARCHITECTURE.md with hybrid approach
- [ ] Create CORE_WORKSPACES.md documenting built-in workspaces
- [ ] Create PLUGIN_DEVELOPMENT.md for future third-party plugins

#### Phase 4: Integrate SDK for Future
- [ ] Add SDKProvider to `main.tsx`
- [ ] Document SDK usage for plugin developers
- [ ] Keep core workspaces using direct imports (for now)
- [ ] Test that SDK is available for future plugins

#### Phase 5: Commit and Merge
- [ ] Commit all changes
- [ ] Push branch
- [ ] Create pull request
- [ ] Merge to main

---

## 12. Risk Assessment

### High Risk
- **Breaking existing functionality** - Workspaces are actively used
- **SDK integration issues** - Context dependencies are complex
- **Build/runtime errors** - Vite glob imports can be finicky

### Medium Risk
- **Performance impact** - Dynamic imports may affect load time
- **Type safety** - Dynamic component loading loses some type checking
- **Documentation drift** - Multiple docs need to stay in sync

### Low Risk
- **Git conflicts** - Branch is isolated
- **External repo issues** - Can always recreate
- **CLI tool bugs** - Not critical path

---

## 13. Questions to Answer

Before proceeding, you need to decide:

1. **What is the goal?**
   - True plugin separation (external distribution)?
   - Or just better code organization (internal)?

2. **What is the source of truth?**
   - The enhanced 2,074/1,035 line versions in this repo?
   - Or the simplified 634/620 line versions in external repo?

3. **How important is plugin distribution?**
   - Do you plan to distribute workspaces as separate packages?
   - Or are they always bundled with the core app?

4. **What about existing workspaces?**
   - SADashboard.tsx (98,309 lines) - still used?
   - Other workspace files - migrate or keep?

5. **Timeline and priority?**
   - Is this blocking other work?
   - Or can it be completed incrementally?

---

## 14. My Recommendation

**Choose Option A (Complete the Separation)** if:
- You want to distribute workspaces independently
- You plan to support third-party plugins
- You have 2-3 days to complete the work
- The plugin architecture is a core feature

**Choose Option B (Keep Internal)** if:
- You just want better code organization
- No plans for external plugin distribution
- Need to ship quickly (1 day)
- Plugin architecture was exploratory

**Choose Option C (Hybrid)** if:
- You want flexibility for the future
- Not sure about external plugins yet
- Want to preserve the work done
- Need a pragmatic middle ground

**My personal recommendation**: **Option A** - You've already done 70% of the work. The plugin architecture is well-designed and the CLI tool is solid. Finishing it properly will pay dividends for future workspace development and potential third-party contributions.

---

## 15. Next Steps

1. **Review this report** - Understand the current state
2. **Make a decision** - Choose Option A, B, or C
3. **Create a plan** - Use the appropriate checklist above
4. **Execute incrementally** - Don't try to do everything at once
5. **Test thoroughly** - Each phase should be tested before moving on
6. **Document as you go** - Update docs to match reality

---

## Appendix: File Inventory

### Modified Files (19)
```
.amazonq/cli-agents/work-agent.json
package-lock.json
packages/sdk/src/api.ts
packages/sdk/src/hooks.ts
packages/sdk/src/index.ts
packages/sdk/src/providers.tsx
src-ui/src/components/FileAttachmentInput.tsx
src-ui/src/contexts/NavigationContext.tsx
src-ui/src/core/SDKAdapter.tsx
src-ui/src/index.css
src-ui/src/main.tsx
src-ui/src/plugins/sa-dashboard/index.tsx
src-ui/src/plugins/sa-dashboard/plugin.json
src-ui/src/plugins/sfdc-account-manager/index.tsx
src-ui/src/plugins/sfdc-account-manager/plugin.json
src-ui/src/plugins/shared/workspace.css
src-ui/src/views/SettingsView.tsx
src-ui/src/views/WorkspaceView.tsx
src-ui/src/workspaces/index.tsx
```

### Untracked Files/Directories
```
.work-agent/agents/stallion-workspace:work-agent/
.work-agent/plugins/
.work-agent/workspaces/stallion/
packages/sdk/package-lock.json
refactor (76MB file)
test-plugin.mjs
```

### Key Workspace Files
```
src-ui/src/workspaces/stallion-workspace/
├── Calendar.tsx (2,074 lines) ← ACTIVE
├── Calendar.tsx.simple (672 lines) ← BACKUP
├── CRM.tsx (1,035 lines) ← ACTIVE
├── CRM.tsx.simple (621 lines) ← BACKUP
├── hooks.ts (1,206 bytes)
├── index.ts (68 bytes)
├── index.tsx (275 bytes)
└── plugin.json (545 bytes)
```

### External Repo Files
```
../work-agent-plugins/packages/work-workspace/
├── src/
│   ├── Calendar.tsx (634 lines) ← OUTDATED
│   ├── CRM.tsx (620 lines) ← OUTDATED
│   └── index.tsx (275 bytes)
├── agents/work-agent/agent.json
├── plugin.json (545 bytes, modified)
├── workspace.json (829 bytes)
├── package.json (676 bytes)
└── README.md (1,759 bytes)
```

---

**End of Report**
