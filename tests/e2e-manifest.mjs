import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const E2E_AUDIT_PATTERN =
  /localhost:(3141|3000|5274)|waitForTimeout\(|test\.skip\(/;

export const E2E_BUCKETS = [
  'product',
  'smoke-live',
  'extended',
  'audit',
  'screenshot',
  'quarantine',
  'android',
];

export const e2eManifest = [
  {
    path: 'tests/project-lifecycle.spec.ts',
    bucket: 'product',
    surface: 'Projects',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted project lifecycle lane.',
    exceptions: [],
  },
  {
    path: 'tests/project-forms.spec.ts',
    bucket: 'product',
    surface: 'Projects',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted project create/edit form lane.',
    exceptions: [],
  },
  {
    path: 'tests/project-agent-scoping.spec.ts',
    bucket: 'product',
    surface: 'Projects',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted project agent scoping lane.',
    exceptions: [],
  },
  {
    path: 'tests/project-architecture.spec.ts',
    bucket: 'product',
    surface: 'Projects',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted project layout and architecture lane.',
    exceptions: [],
  },
  {
    path: 'tests/agents.spec.ts',
    bucket: 'product',
    surface: 'Agents',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted agents lane.',
    exceptions: [],
  },
  {
    path: 'tests/default-agent-workflow.spec.ts',
    bucket: 'product',
    surface: 'Agents',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted default agent workflow lane.',
    exceptions: [],
  },
  {
    path: 'tests/builtin-runtime-workflow.spec.ts',
    bucket: 'product',
    surface: 'Agents',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted built-in runtime workflow lane.',
    exceptions: [],
  },
  {
    path: 'tests/playbooks.spec.ts',
    bucket: 'product',
    surface: 'Guidance',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted Playbooks lane.',
    exceptions: [],
  },
  {
    path: 'tests/prompts.spec.ts',
    bucket: 'product',
    surface: 'Guidance',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted prompt compatibility lane for Playbooks.',
    exceptions: [],
  },
  {
    path: 'tests/skills.spec.ts',
    bucket: 'product',
    surface: 'Guidance',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted Skills lane.',
    exceptions: [],
  },
  {
    path: 'tests/registry.spec.ts',
    bucket: 'product',
    surface: 'Registry',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted registry browse lane.',
    exceptions: [],
  },
  {
    path: 'tests/registry-install.spec.ts',
    bucket: 'product',
    surface: 'Registry',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted registry install lane.',
    exceptions: [],
  },
  {
    path: 'tests/system-registry.spec.ts',
    bucket: 'product',
    surface: 'Registry',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted system registry lane.',
    exceptions: [],
  },
  {
    path: 'tests/connections-crud.spec.ts',
    bucket: 'product',
    surface: 'Connections',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted connections CRUD lane.',
    exceptions: [],
  },
  {
    path: 'tests/connect-modal.spec.ts',
    bucket: 'product',
    surface: 'Connections',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted connection modal lane.',
    exceptions: [],
  },
  {
    path: 'tests/connect-reconnect-banner.spec.ts',
    bucket: 'product',
    surface: 'Connections',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted connection reconnect banner lane.',
    exceptions: [],
  },
  {
    path: 'tests/plugin-update.spec.ts',
    bucket: 'product',
    surface: 'Plugins',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted plugin update lane.',
    exceptions: [],
  },
  {
    path: 'tests/plugin-preview.spec.ts',
    bucket: 'product',
    surface: 'Plugins',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted plugin preview lane.',
    exceptions: [],
  },
  {
    path: 'tests/plugin-system.spec.ts',
    bucket: 'product',
    surface: 'Plugins',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted plugin system lane.',
    exceptions: [],
  },
  {
    path: 'tests/schedule-runs.spec.ts',
    bucket: 'product',
    surface: 'Schedule',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted schedule run history lane.',
    exceptions: [],
  },
  {
    path: 'tests/schedule.spec.ts',
    bucket: 'product',
    surface: 'Schedule',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Hermetic schedule CRUD lane covering add, edit, duplicate, run, filter, toggle, and delete.',
    exceptions: [],
  },
  {
    path: 'tests/monitoring.spec.ts',
    bucket: 'product',
    surface: 'Monitoring',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted monitoring shell lane.',
    exceptions: [],
  },
  {
    path: 'tests/orchestration-provider-picker.spec.ts',
    bucket: 'product',
    surface: 'Chat / Orchestration',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted orchestration provider picker lane.',
    exceptions: [],
  },
  {
    path: 'tests/orchestration-chat-flow.spec.ts',
    bucket: 'product',
    surface: 'Chat / Orchestration',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted orchestration chat flow lane.',
    exceptions: [],
  },
  {
    path: 'tests/orchestration-recovery.spec.ts',
    bucket: 'product',
    surface: 'Chat / Orchestration',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted orchestration recovery lane.',
    exceptions: [],
  },
  {
    path: 'tests/new-chat-provider-managed.spec.ts',
    bucket: 'product',
    surface: 'Chat / Orchestration',
    tierTarget: 'full',
    primary: true,
    rationale: 'Promoted provider-managed new chat lane.',
    exceptions: [],
  },
  {
    path: 'tests/ui-crud-smoke.spec.ts',
    bucket: 'smoke-live',
    surface: 'Live Smoke',
    tierTarget: 'smoke',
    primary: true,
    rationale: 'Real temp-home CRUD smoke for launcher/server/UI wiring.',
    exceptions: [],
  },
  {
    path: 'tests/acp-project-context.spec.ts',
    bucket: 'extended',
    surface: 'Agents',
    tierTarget: 'full',
    primary: true,
    rationale:
      'ACP project context is primary but needs promotion review after agent ACP lane hardening.',
    exceptions: [],
  },
  {
    path: 'tests/coding-layout-plan-panel.spec.ts',
    bucket: 'extended',
    surface: 'Projects',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Coding layout plan panel is a product workflow pending product-bucket promotion review.',
    exceptions: [],
  },
  {
    path: 'tests/core-update.spec.ts',
    bucket: 'extended',
    surface: 'Settings',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Core update is routed product behavior pending promotion review.',
    exceptions: [],
  },
  {
    path: 'tests/dock-mode-preference.spec.ts',
    bucket: 'extended',
    surface: 'Chat / Orchestration',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Dock mode preference is primary but still has timing waits to remove before product promotion.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/notifications-inbox.spec.ts',
    bucket: 'extended',
    surface: 'Notifications',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Notifications inbox is primary routed behavior pending promotion review.',
    exceptions: [],
  },
  {
    path: 'tests/notifications.spec.ts',
    bucket: 'extended',
    surface: 'Notifications',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Notifications flow is primary but still keeps a local fallback URL for standalone runs before product promotion.',
    exceptions: ['localhost:5274'],
  },
  {
    path: 'tests/onboarding-setup-banner.spec.ts',
    bucket: 'extended',
    surface: 'Onboarding',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Onboarding setup banner is primary and pending product-bucket promotion review.',
    exceptions: [],
  },
  {
    path: 'tests/orchestration-tool-activity-notifications.spec.ts',
    bucket: 'extended',
    surface: 'Chat / Orchestration',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Tool activity notifications are primary runtime behavior pending promotion review.',
    exceptions: [],
  },
  {
    path: 'tests/profile.spec.ts',
    bucket: 'extended',
    surface: 'Profile',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Profile is a routed surface pending product-bucket promotion review.',
    exceptions: [],
  },
  {
    path: 'tests/settings.spec.ts',
    bucket: 'extended',
    surface: 'Settings',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Settings is a routed surface pending product-bucket promotion review.',
    exceptions: [],
  },
  {
    path: 'tests/ui-blocks.spec.ts',
    bucket: 'extended',
    surface: 'UI Blocks',
    tierTarget: 'partial',
    primary: false,
    rationale:
      'UI block assertions are valuable regression coverage but not a primary surface lane.',
    exceptions: [],
  },
  {
    path: 'tests/voice-providers.spec.ts',
    bucket: 'extended',
    surface: 'Connections',
    tierTarget: 'full',
    primary: true,
    rationale:
      'Voice provider settings are connection-adjacent primary behavior pending product-bucket promotion review.',
    exceptions: [],
  },
  {
    path: 'tests/chart-hover.spec.ts',
    bucket: 'audit',
    surface: 'Monitoring',
    tierTarget: 'partial',
    primary: false,
    rationale:
      'Chart hover probe remains audit-level until it asserts product behavior without fixed waits.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/network-audit.spec.ts',
    bucket: 'audit',
    surface: 'Network Audit',
    tierTarget: 'audit',
    primary: false,
    rationale:
      'Network audit is intentionally exploratory and not product-gate coverage.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/screenshots.spec.ts',
    bucket: 'screenshot',
    surface: 'Screenshots',
    tierTarget: 'screenshot',
    primary: false,
    rationale:
      'Screenshot capture is a visual artifact lane until product assertions are added.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/android/app-load.spec.ts',
    bucket: 'android',
    surface: 'Android',
    tierTarget: 'partial',
    primary: false,
    rationale: 'Android app-load coverage runs in the Android matrix.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/android/desktop-regression.spec.ts',
    bucket: 'android',
    surface: 'Android',
    tierTarget: 'partial',
    primary: false,
    rationale:
      'Android desktop-regression coverage runs in the Android matrix.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/android/mobile-layout.spec.ts',
    bucket: 'android',
    surface: 'Android',
    tierTarget: 'partial',
    primary: false,
    rationale: 'Android mobile-layout coverage runs in the Android matrix.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/android/navigation.spec.ts',
    bucket: 'android',
    surface: 'Android',
    tierTarget: 'partial',
    primary: false,
    rationale: 'Android navigation coverage runs in the Android matrix.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/android/split-pane-mobile.spec.ts',
    bucket: 'android',
    surface: 'Android',
    tierTarget: 'partial',
    primary: false,
    rationale: 'Android split-pane coverage runs in the Android matrix.',
    exceptions: ['waitForTimeout'],
  },
  {
    path: 'tests/android/webview-compat.spec.ts',
    bucket: 'android',
    surface: 'Android',
    tierTarget: 'partial',
    primary: false,
    rationale:
      'Android webview compatibility coverage runs in the Android matrix.',
    exceptions: ['waitForTimeout'],
  },
];

export function getSpecsForSuite(suite) {
  return e2eManifest
    .filter((entry) => entry.bucket === suite)
    .map((entry) => entry.path);
}

export function listSpecFiles(rootDir = process.cwd()) {
  const topLevel = readdirSync(join(rootDir, 'tests'), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => `tests/${entry.name}`);
  const android = readdirSync(join(rootDir, 'tests/android'), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => `tests/android/${entry.name}`);
  return [...topLevel, ...android].sort();
}

export function validateE2EManifest({
  rootDir = process.cwd(),
  readFile,
} = {}) {
  const errors = [];
  const knownFiles = listSpecFiles(rootDir);
  const knownFileSet = new Set(knownFiles);
  const assigned = new Map();

  for (const entry of e2eManifest) {
    if (!entry.path || typeof entry.path !== 'string') {
      errors.push('Manifest entry is missing a path.');
      continue;
    }
    if (!E2E_BUCKETS.includes(entry.bucket)) {
      errors.push(`${entry.path} uses unknown bucket '${entry.bucket}'.`);
    }
    if (!knownFileSet.has(entry.path)) {
      errors.push(
        `${entry.path} is listed in the manifest but does not exist.`,
      );
    }
    if (assigned.has(entry.path)) {
      errors.push(
        `${entry.path} is assigned multiple times (${assigned.get(entry.path)}, ${entry.bucket}).`,
      );
    }
    assigned.set(entry.path, entry.bucket);
    if (!entry.surface) {
      errors.push(`${entry.path} is missing a surface.`);
    }
    if (!entry.tierTarget) {
      errors.push(`${entry.path} is missing a tierTarget.`);
    }
    if (!entry.rationale) {
      errors.push(`${entry.path} is missing a rationale.`);
    }
    if (entry.bucket === 'quarantine' && !entry.replacement) {
      errors.push(`${entry.path} is quarantined without replacement coverage.`);
    }
    if (entry.primary && entry.bucket === 'extended' && !entry.rationale) {
      errors.push(
        `${entry.path} is primary extended coverage without rationale.`,
      );
    }
    if (entry.bucket === 'product' && readFile) {
      const text = readFile(join(rootDir, entry.path));
      if (E2E_AUDIT_PATTERN.test(text) && entry.exceptions.length === 0) {
        errors.push(`${entry.path} has unresolved product audit violations.`);
      }
    }
  }

  for (const specFile of knownFiles) {
    if (!assigned.has(specFile)) {
      errors.push(`${specFile} is not assigned to an E2E manifest bucket.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
