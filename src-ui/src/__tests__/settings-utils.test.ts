import { describe, expect, test } from 'vitest';
import { getSettingsValidation, isSettingsSectionVisible } from '../views/settings/utils';

describe('settings utils', () => {
  test('getSettingsValidation returns errors and warnings for invalid config', () => {
    const result = getSettingsValidation({
      region: 'bad region',
      systemPrompt: 'x'.repeat(10001),
      templateVariables: [
        { key: 'bad key', type: 'static', value: '' },
      ],
    } as any);

    expect(result.errors).toEqual(
      expect.objectContaining({
        region: 'Invalid region format (e.g. us-east-1)',
        systemPrompt: 'Exceeds 10,000 character limit',
        templateVars: 'Variable names cannot contain spaces',
      }),
    );
    expect(result.warnings.templateVarValues).toBe(
      'Static variables with empty values will resolve to blank',
    );
    expect(result.isValid).toBe(false);
  });

  test('isSettingsSectionVisible uses section term matches', () => {
    expect(isSettingsSectionVisible('section-connection', 'backend')).toBe(true);
    expect(isSettingsSectionVisible('section-connection', 'voice')).toBe(false);
    expect(isSettingsSectionVisible('section-connection', '')).toBe(true);
  });
});
