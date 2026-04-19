import { describe, expect, test } from 'vitest';

import {
  buildPlaybookPath,
  PLAYBOOK_COLLECTION_PATH,
} from '../stallion-control-catalog-tools.js';

describe('stallion-control catalog tools', () => {
  test('uses the playbooks collection as the canonical catalog path', () => {
    expect(PLAYBOOK_COLLECTION_PATH).toBe('/api/playbooks');
    expect(buildPlaybookPath()).toBe('/api/playbooks');
  });

  test('builds item, run, and outcome paths from the playbooks base', () => {
    expect(buildPlaybookPath('smoke-playbook')).toBe(
      '/api/playbooks/smoke-playbook',
    );
    expect(buildPlaybookPath('smoke-playbook', 'run')).toBe(
      '/api/playbooks/smoke-playbook/run',
    );
    expect(buildPlaybookPath('smoke-playbook', 'outcome')).toBe(
      '/api/playbooks/smoke-playbook/outcome',
    );
  });
});
