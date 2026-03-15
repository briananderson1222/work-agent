/**
 * Canonical base directory resolution.
 * Priority: STALLION_AI_DIR env → ~/.stallion-ai
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveHomeDir(): string {
  return process.env.STALLION_AI_DIR || join(homedir(), '.stallion-ai');
}
