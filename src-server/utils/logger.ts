/**
 * Framework-agnostic logger factory.
 *
 * Currently delegates to @voltagent/logger. When VoltAgent is removed,
 * swap this one file to use pino directly (add pino as a direct dep at that point).
 *
 * Every file that needs a logger imports from here — not from @voltagent/logger.
 */

export { createPinoLogger as createLogger } from '@voltagent/logger';

/** Minimal logger interface for route DI. */
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}
