import { describe, expect, it } from 'vitest';

import {
  buildEvidenceRecord,
  buildMarkdownSummary,
  classifyNodes,
  loadPilotConfig,
  parseArgs,
  resolveWorkstream,
} from '../veritas-report.mjs';

const config = loadPilotConfig();

describe('veritas-report', () => {
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
      affectedLanes: [
        '.github/**',
        'packages/sdk',
        'root manifests',
        'src-server',
        'tests/**',
      ],
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
        runId: 'veritas-test-default',
      },
    });

    expect(record.resolved_phase).toBe('Phase 1 (Harden & Onboard)');
    expect(record.resolved_workstream).toBe(
      'Entity Hierarchy & Navigation Restructure',
    );
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
    expect(record.adapter).toMatchObject({
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
        'Veritas evidence before promotion',
      ],
    });
    expect(record.selected_proof_commands).toEqual([
      'npm run proof:repo-governance',
      'npm run proof:ui-data-access',
      'npm run verify:static',
      'npm run build:server && npm run build:ui',
    ]);
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
      '.omx/plans/plan-work-agent-veritas-migration-2026-04-26.md',
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
      '.omx/plans/plan-work-agent-veritas-migration-2026-04-26.md',
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
      files: ['unknown-root-file.md'],
      config,
      options: {
        runId: 'veritas-test-explicit',
        workstream: 'phase1-doc-hardening',
        sourceRef: 'feature/test',
      },
    });

    expect(record.resolved_phase).toBe('Phase 1 (Harden & Onboard)');
    expect(record.resolved_workstream).toBe('phase1-doc-hardening');
    expect(record.source_ref).toBe('feature/test');
    expect(record.unresolved_files).toEqual(['unknown-root-file.md']);
    expect(record.recommendations).toHaveLength(1);
  });

  it('parses CLI arguments into options and files', () => {
    const parsed = parseArgs([
      '--workstream',
      'phase1-veritas',
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
        workstream: 'phase1-veritas',
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
        runId: 'veritas-summary',
        baselineCiFastStatus: 'success',
      },
    });

    expect(
      buildMarkdownSummary(record, '.veritas/evidence/veritas-summary.json'),
    ).toContain('## Veritas Report');
    expect(
      buildMarkdownSummary(record, '.veritas/evidence/veritas-summary.json'),
    ).toContain('**Adapter:** work-agent (repo-adapter)');
    expect(
      buildMarkdownSummary(record, '.veritas/evidence/veritas-summary.json'),
    ).toContain('**Affected nodes:** delivery.github, product.src-server');
    expect(
      buildMarkdownSummary(record, '.veritas/evidence/veritas-summary.json'),
    ).toContain('**Affected lanes:** .github/**, src-server');
    expect(
      buildMarkdownSummary(record, '.veritas/evidence/veritas-summary.json'),
    ).toContain('npm run proof:runtime-contracts');
    expect(
      buildMarkdownSummary(record, '.veritas/evidence/veritas-summary.json'),
    ).toContain('Report transport:** github-step-summary');
  });

  it('routes runtime server changes to connected-agents as replacement proof', () => {
    const record = buildEvidenceRecord({
      files: ['src-server/providers/adapters/codex-adapter.ts'],
      config,
      options: {
        runId: 'runtime-contracts-replacement-proof',
      },
    });

    expect(record.selected_proof_commands).toContain(
      'npm run proof:runtime-contracts',
    );
    expect(record.selected_proof_commands).toContain(
      'npm run test:connected-agents',
    );
    expect(
      record.proof_family_results.find(
        (family) => family.id === 'runtime-contracts',
      ),
    ).toMatchObject({
      disposition: 'move-to-test',
      blocking_status: 'advisory',
      freshness_status: 'current',
      evidence_basis:
        'test:connected-agents plus Veritas route-selection regression test',
    });
  });

  it('leaves baseline proof unknown when not explicitly passed', () => {
    const record = buildEvidenceRecord({
      files: ['src-server/routes/chat.ts'],
      config,
      options: {
        runId: 'veritas-baseline-unknown',
      },
    });

    expect(record.baseline_ci_fast_passed).toBeNull();
  });

  it('represents a failed baseline proof lane explicitly', () => {
    const record = buildEvidenceRecord({
      files: ['src-server/routes/chat.ts'],
      config,
      options: {
        runId: 'veritas-baseline-failed',
        baselineCiFastStatus: 'failed',
      },
    });

    expect(record.baseline_ci_fast_passed).toBe(false);
  });
});
