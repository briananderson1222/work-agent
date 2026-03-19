import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_HOME } from './helpers.js';

const CONFIG_PATH = join(PROJECT_HOME, 'config', 'app.json');

function loadConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_PATH)) return {};
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function saveConfig(config: Record<string, unknown>): void {
  mkdirSync(join(PROJECT_HOME, 'config'), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function configGet(key?: string): void {
  const config = loadConfig();
  if (!key) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  const value = config[key];
  if (value === undefined) {
    console.log(`(not set)`);
  } else {
    console.log(typeof value === 'string' ? value : JSON.stringify(value));
  }
}

export function configSet(key: string, value: string): void {
  if (!key || value === undefined) {
    console.error('Usage: stallion config set <key> <value>');
    process.exit(1);
  }
  const config = loadConfig();
  // Parse booleans and numbers
  if (value === 'true') config[key] = true;
  else if (value === 'false') config[key] = false;
  else if (value === 'null') delete config[key];
  else if (/^\d+$/.test(value)) config[key] = parseInt(value, 10);
  else config[key] = value;
  saveConfig(config);
  console.log(`  ✓ ${key} = ${config[key] ?? '(unset)'}`);
}
