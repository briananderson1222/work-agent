import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  E2E_BUCKETS,
  e2eManifest,
  getSpecsForSuite,
  listSpecFiles,
  validateE2EManifest,
} from '../../tests/e2e-manifest.mjs';

describe('e2e manifest', () => {
  it('assigns every Playwright spec to exactly one bucket', () => {
    const result = validateE2EManifest({
      rootDir: process.cwd(),
      readFile: (filePath) => readFileSync(filePath, 'utf8'),
    });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(e2eManifest).toHaveLength(listSpecFiles().length);
  });

  it('keeps active product, smoke, extended, audit, screenshot, and android buckets explicit', () => {
    const buckets = new Set(e2eManifest.map((entry) => entry.bucket));

    for (const bucket of E2E_BUCKETS.filter(
      (candidate) => candidate !== 'quarantine',
    )) {
      expect(buckets.has(bucket)).toBe(true);
    }
  });

  it('selects runner suites from manifest buckets', () => {
    expect(getSpecsForSuite('product')).toContain(
      'tests/project-lifecycle.spec.ts',
    );
    expect(getSpecsForSuite('smoke-live')).toEqual([
      'tests/ui-crud-smoke.spec.ts',
    ]);
    expect(getSpecsForSuite('extended')).toContain('tests/settings.spec.ts');
    expect(getSpecsForSuite('audit')).toEqual([
      'tests/chart-hover.spec.ts',
      'tests/network-audit.spec.ts',
    ]);
    expect(getSpecsForSuite('screenshot')).toEqual([
      'tests/screenshots.spec.ts',
    ]);
  });

  it('documents quarantine replacement coverage', () => {
    const quarantined = e2eManifest.filter(
      (entry) => entry.bucket === 'quarantine',
    );

    expect(quarantined).toEqual([]);
  });

  it('lets the runner list supported suites without starting Stallion', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/run-e2e-suite.mjs', '--suite=extended', '--list'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.suite).toBe('extended');
    expect(parsed.specs).toContain('tests/settings.spec.ts');
  });

  it('rejects unknown runner suites with an actionable message', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/run-e2e-suite.mjs', '--suite=unknown', '--list'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Unknown E2E suite 'unknown'. Use product, smoke-live, extended, audit, screenshot.",
    );
  });
});
