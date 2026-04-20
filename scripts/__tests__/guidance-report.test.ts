import { describe, expect, it } from 'vitest';

import {
  buildEvidenceRecord,
  buildMarkdownSummary,
  classifyNodes,
  loadPilotConfig,
  parseArgs,
  resolveWorkstream,
} from '../guidance-report.mjs';

const config = loadPilotConfig();

describe('guidance-report', () => {
  it('maps files to concrete repo lanes', () => {
    const result = classifyNodes(
      [
        'src-server/routes/chat.ts',
        'packages/sdk/src/index.ts',
        '.github/workflows/ci.yml',
        'tests/registry.spec.ts',
        'package.json',
      ],
      config,
    );

    expect(result).toEqual({
      affectedNodes: [
        'delivery.github',
        'governance.root-manifests',
        'package.sdk',
        'product.src-server',
        'verification.tests',
      ],
      affectedLanes: ['.github/**', 'packages/sdk', 'root manifests', 'src-server', 'tests/**'],
      unmatchedFiles: [],
    });
  });

  it('does not treat root-manifest prefixes as exact matches', () => {
    const result = classifyNodes(['package.json.backup'], config);

    expect(result).toEqual({
      affectedNodes: [],
      affectedLanes: [],
      unmatchedFiles: ['package.json.backup'],
    });
  });

  it('uses the active initiative when no explicit workstream is provided', () => {
    const record = buildEvidenceRecord({
      files: ['src-ui/src/views/RegistryView.tsx'],
      config,
      options: {
        runId: 'guidance-test-default',
      },
    });

    expect(record.resolved_phase).toBe('Phase 1 (Harden & Onboard)');
    expect(record.resolved_workstream).toBe('Entity Hierarchy & Navigation Restructure');
    expect(record.matched_artifacts).toEqual(['docs/strategy/roadmap.md']);
    expect(record.promotion_allowed).toBe(true);
    expect(record.framework_version).toBe(1);
    expect(record.false_positive_review).toBe('unknown');
    expect(record.promotion_candidate).toBe(false);
    expect(record.override_or_bypass).toBe(false);
    expect(record.framework).toEqual({
      version: 1,
      resolver_precedence: config.graph.resolverPrecedence,
      policy_defaults: {
        false_positive_review: 'unknown',
        promotion_candidate: false,
        override_or_bypass: false,
      },
    });
    expect(record.adapter).toEqual({
      name: 'work-agent',
      kind: 'repo-adapter',
      report_transport: 'github-step-summary',
      default_resolution: {
        phase: 'Phase 1 (Harden & Onboard)',
        workstream: 'Entity Hierarchy & Navigation Restructure',
        matchedArtifacts: ['docs/strategy/roadmap.md'],
      },
      non_sliceable_invariants: [
        'CLI/API/UI parity',
        'SDK contract integrity',
        'plugin/core boundary protection',
        'mandatory CI coverage',
      ],
      required_proof_lanes: ['npm run ci:fast'],
    });
  });

  it('resolves workstream via config-defined resolution rules', () => {
    const resolution = resolveWorkstream({}, config, [
      'docs/plans/plan-entity-hierarchy.md',
      'src-ui/src/views/RegistryView.tsx',
    ]);

    expect(resolution).toEqual({
      resolvedPhase: 'Phase 1 (Harden & Onboard)',
      resolvedWorkstream: 'Entity Hierarchy & Navigation Restructure',
      matchedArtifacts: ['docs/plans/**'],
      promotionAllowed: true,
    });
  });

  it('resolves local .omx plan files via config-defined local-plan rule', () => {
    const resolution = resolveWorkstream({}, config, [
      '.omx/plans/plan-work-agent-ai-guidance-pilot-2026-04-19.md',
      'src-server/routes/chat.ts',
    ]);

    expect(resolution).toEqual({
      resolvedPhase: 'Phase 1 (Harden & Onboard)',
      resolvedWorkstream: 'Entity Hierarchy & Navigation Restructure',
      matchedArtifacts: ['.omx/plans/**'],
      promotionAllowed: true,
    });
  });

  it('prefers docs/plans over .omx/plans when both match', () => {
    const resolution = resolveWorkstream({}, config, [
      '.omx/plans/plan-work-agent-ai-guidance-pilot-2026-04-19.md',
      'docs/plans/plan-entity-hierarchy.md',
    ]);

    expect(resolution).toEqual({
      resolvedPhase: 'Phase 1 (Harden & Onboard)',
      resolvedWorkstream: 'Entity Hierarchy & Navigation Restructure',
      matchedArtifacts: ['docs/plans/**'],
      promotionAllowed: true,
    });
  });

  it('respects explicit workstream overrides and flags unmatched files', () => {
    const record = buildEvidenceRecord({
      files: ['README.md'],
      config,
      options: {
        runId: 'guidance-test-explicit',
        workstream: 'phase1-doc-hardening',
        sourceRef: 'feature/test',
      },
    });

    expect(record.resolved_phase).toBe('Phase 1 (Harden & Onboard)');
    expect(record.resolved_workstream).toBe('phase1-doc-hardening');
    expect(record.source_ref).toBe('feature/test');
    expect(record.unresolved_files).toEqual(['README.md']);
    expect(record.recommendations).toHaveLength(1);
  });

  it('parses CLI arguments into options and files', () => {
    const parsed = parseArgs([
      '--workstream',
      'phase1-guidance',
      '--source-ref',
      'feature/demo',
      '--baseline-ci-fast-status',
      'failed',
      '--changed-from',
      'origin/main',
      '--changed-to',
      'HEAD',
      '--summary-path',
      '/tmp/guidance.md',
      'src-server/routes/chat.ts',
      'scripts/verify-convergence.mjs',
    ]);

    expect(parsed).toEqual({
      options: {
        workstream: 'phase1-guidance',
        sourceRef: 'feature/demo',
        baselineCiFastStatus: 'failed',
        changedFrom: 'origin/main',
        changedTo: 'HEAD',
        summaryPath: '/tmp/guidance.md',
      },
      files: ['src-server/routes/chat.ts', 'scripts/verify-convergence.mjs'],
    });
  });

  it('renders a markdown summary with artifact and lanes', () => {
    const record = buildEvidenceRecord({
      files: ['src-server/routes/chat.ts', '.github/workflows/ci.yml'],
      config,
      options: {
        runId: 'guidance-summary',
        baselineCiFastStatus: 'success',
      },
    });

    expect(buildMarkdownSummary(record, '.omx/evidence/work-agent-pilot/guidance-summary.json')).toContain(
      '## Guidance Report',
    );
    expect(buildMarkdownSummary(record, '.omx/evidence/work-agent-pilot/guidance-summary.json')).toContain(
      '**Adapter:** work-agent (repo-adapter)',
    );
    expect(buildMarkdownSummary(record, '.omx/evidence/work-agent-pilot/guidance-summary.json')).toContain(
      '**Affected nodes:** delivery.github, product.src-server',
    );
    expect(buildMarkdownSummary(record, '.omx/evidence/work-agent-pilot/guidance-summary.json')).toContain(
      '**Affected lanes:** .github/**, src-server',
    );
    expect(buildMarkdownSummary(record, '.omx/evidence/work-agent-pilot/guidance-summary.json')).toContain(
      '`npm run ci:fast`',
    );
    expect(buildMarkdownSummary(record, '.omx/evidence/work-agent-pilot/guidance-summary.json')).toContain(
      'Report transport:** github-step-summary',
    );
  });

  it('leaves baseline proof unknown when not explicitly passed', () => {
    const record = buildEvidenceRecord({
      files: ['src-server/routes/chat.ts'],
      config,
      options: {
        runId: 'guidance-baseline-unknown',
      },
    });

    expect(record.baseline_ci_fast_passed).toBeNull();
  });

  it('represents a failed baseline proof lane explicitly', () => {
    const record = buildEvidenceRecord({
      files: ['src-server/routes/chat.ts'],
      config,
      options: {
        runId: 'guidance-baseline-failed',
        baselineCiFastStatus: 'failed',
      },
    });

    expect(record.baseline_ci_fast_passed).toBe(false);
  });
});
