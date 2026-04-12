import { afterEach, describe, expect, test, vi } from 'vitest';
import { resolveRuntimeCorsOrigin } from '../runtime-http.js';

describe('resolveRuntimeCorsOrigin', () => {
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    }
    vi.restoreAllMocks();
  });

  test('allows localhost, tauri, and private-network origins', () => {
    expect(resolveRuntimeCorsOrigin('http://localhost:5173')).toBe(
      'http://localhost:5173',
    );
    expect(resolveRuntimeCorsOrigin('https://tauri.localhost')).toBe(
      'https://tauri.localhost',
    );
    expect(resolveRuntimeCorsOrigin('http://192.168.1.14:3000')).toBe(
      'http://192.168.1.14:3000',
    );
    expect(resolveRuntimeCorsOrigin('http://10.0.0.8:3000')).toBe(
      'http://10.0.0.8:3000',
    );
    expect(resolveRuntimeCorsOrigin('http://172.20.1.20:3000')).toBe(
      'http://172.20.1.20:3000',
    );
  });

  test('allows configured origins and rejects everything else', () => {
    process.env.ALLOWED_ORIGINS =
      'https://app.example.com,https://ops.example.com';

    expect(resolveRuntimeCorsOrigin('https://app.example.com')).toBe(
      'https://app.example.com',
    );
    expect(resolveRuntimeCorsOrigin('https://unknown.example.com')).toBeNull();
  });
});
