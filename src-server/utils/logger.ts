/**
 * Framework-agnostic logger factory.
 *
 * Currently delegates to @voltagent/logger. When VoltAgent is removed,
 * swap this one file to use pino directly (add pino as a direct dep at that point).
 *
 * Every file that needs a logger imports from here — not from @voltagent/logger.
 */

export { createPinoLogger as createLogger } from '@voltagent/logger';
