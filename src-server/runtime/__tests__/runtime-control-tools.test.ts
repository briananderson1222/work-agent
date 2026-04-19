import { describe, expect, test } from 'vitest';

import { SC_READ_ONLY_TOOLS } from '../runtime-control-tools.js';

describe('runtime control tools', () => {
  test('keeps both playbook and prompt list aliases auto-approved', () => {
    expect(SC_READ_ONLY_TOOLS).toContain('stallion-control_list_playbooks');
    expect(SC_READ_ONLY_TOOLS).toContain('stallion-control_list_prompts');
  });
});
