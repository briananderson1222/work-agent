import { describe, expect, test, vi } from 'vitest';
import { isAutoApproved, wrapToolWithElicitation } from '../tool-approval.js';

describe('tool-approval', () => {
  test('isAutoApproved supports exact, wildcard, and full wildcard patterns', () => {
    expect(isAutoApproved('tool_read', ['tool_read'])).toBe(true);
    expect(isAutoApproved('tool_read', ['tool_*'])).toBe(true);
    expect(isAutoApproved('tool_read', ['*'])).toBe(true);
    expect(isAutoApproved('tool_read', ['other_*'])).toBe(false);
  });

  test('wrapToolWithElicitation short-circuits denied tools', async () => {
    const execute = vi.fn();
    const wrapped = wrapToolWithElicitation(
      { name: 'tool_read', description: 'Read tool', execute } as any,
      { tools: { autoApprove: [] } } as any,
      new Map(),
      {} as any,
      { debug: vi.fn(), info: vi.fn() },
    );

    const result = await wrapped.execute?.(
      { path: '/tmp/file' },
      { elicitation: vi.fn().mockResolvedValue(false) },
    );

    expect(result).toEqual({
      success: false,
      error: 'USER_DENIED',
      message:
        'I requested permission to use this tool, but the user explicitly denied the request. I should ask what I should do differently.',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test('wrapToolWithElicitation passes through approved tools', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const wrapped = wrapToolWithElicitation(
      { name: 'tool_read', description: 'Read tool', execute } as any,
      { tools: { autoApprove: [] } } as any,
      new Map(),
      {} as any,
      { debug: vi.fn(), info: vi.fn() },
    );

    const result = await wrapped.execute?.(
      { path: '/tmp/file' },
      { elicitation: vi.fn().mockResolvedValue(true) },
    );

    expect(result).toEqual({ success: true });
    expect(execute).toHaveBeenCalledWith(
      { path: '/tmp/file' },
      expect.objectContaining({ elicitation: expect.any(Function) }),
    );
  });
});
