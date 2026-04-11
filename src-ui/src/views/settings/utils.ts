import type { AppConfig } from '../../types';

const SECTION_TERMS: Record<string, string> = {
  'section-ai': 'ai models default model system prompt template variables',
  'section-appearance': 'appearance theme dark light font size accent color',
  'section-notifications': 'notifications push alerts subscribe',
  'section-connection': 'connection api url backend region test',
  'section-voice':
    'voice speech text tts stt features geolocation timezone mobile pairing offline queue',
  'section-system':
    'system update log level export import backup restore reset defaults',
};

export function getSettingsValidation(config: AppConfig): {
  errors: Record<string, string>;
  warnings: Record<string, string>;
  isValid: boolean;
} {
  const errors: Record<string, string> = {};
  if (config.region && !/^[a-z]{2}(-[a-z]+-\d+)?$/.test(config.region)) {
    errors.region = 'Invalid region format (e.g. us-east-1)';
  }
  if ((config.systemPrompt || '').length > 10000) {
    errors.systemPrompt = 'Exceeds 10,000 character limit';
  }
  for (const variable of config.templateVariables || []) {
    if (!variable.key.trim()) {
      errors.templateVars = 'Variable names cannot be empty';
      break;
    }
    if (/\s/.test(variable.key)) {
      errors.templateVars = 'Variable names cannot contain spaces';
      break;
    }
  }

  const warnings: Record<string, string> = {};
  for (const variable of config.templateVariables || []) {
    if (variable.type === 'static' && !variable.value?.trim()) {
      warnings.templateVarValues =
        'Static variables with empty values will resolve to blank';
      break;
    }
  }

  return {
    errors,
    warnings,
    isValid: Object.keys(errors).length === 0,
  };
}

export function isSettingsSectionVisible(
  id: string,
  searchQuery: string,
): boolean {
  if (!searchQuery.trim()) return true;
  const query = searchQuery.toLowerCase();
  return SECTION_TERMS[id]?.includes(query) ?? true;
}

const LOCAL_STORAGE_KEYS = [
  'theme',
  'stallion-feature-settings',
  'stallion-stt-provider',
  'stallion-tts-provider',
];

export function buildSettingsExportPayload(config: AppConfig) {
  const localSettings: Record<string, string> = {};
  for (const key of LOCAL_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value) localSettings[key] = value;
  }
  return { ...config, _localStorage: localSettings };
}

export async function parseImportedSettingsFile(
  file: File,
): Promise<{ serverConfig: Partial<AppConfig> }> {
  const text = await file.text();
  const imported = JSON.parse(text);
  const { _localStorage, ...serverConfig } = imported;

  if (_localStorage && typeof _localStorage === 'object') {
    for (const [key, value] of Object.entries(_localStorage)) {
      if (typeof value === 'string') localStorage.setItem(key, value);
    }
  }

  return { serverConfig };
}
