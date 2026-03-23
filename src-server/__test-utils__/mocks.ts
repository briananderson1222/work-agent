import { vi } from 'vitest';

/** Standardized mock logger matching the app's logger interface. */
export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

/** Mock event bus for services that emit/subscribe to events. */
export function createMockEventBus() {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}
