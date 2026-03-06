/**
 * agentResolver — unit tests.
 *
 * Tests resolveAgentName, parseAgentSlug, isWorkspaceAgent and the
 * workspace-scoped context set by _setWorkspaceContext.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAgentName,
  parseAgentSlug,
  isWorkspaceAgent,
  _setWorkspaceContext,
} from '../agentResolver';
import type { WorkspaceConfig } from '../types';

function makeWorkspace(availableAgents: string[]): WorkspaceConfig {
  return {
    slug: 'ws1',
    name: 'WS1',
    tabs: [],
    availableAgents,
  };
}

beforeEach(() => {
  // Clear global workspace context between tests
  _setWorkspaceContext(undefined);
});

// ── resolveAgentName ──────────────────────────────────────────────────────────

describe('resolveAgentName', () => {
  it('name containing ":" → returned as-is (explicit namespace)', () => {
    expect(resolveAgentName('ns:agent')).toBe('ns:agent');
  });

  it('name in workspace availableAgents → returns scoped form', () => {
    const ws = makeWorkspace(['team:alice', 'team:bob']);
    expect(resolveAgentName('alice', ws)).toBe('team:alice');
  });

  it('name not in workspace → returns name as-is (falls back to global)', () => {
    const ws = makeWorkspace(['team:alice']);
    expect(resolveAgentName('charlie', ws)).toBe('charlie');
  });

  it('no workspace provided → returns name as-is', () => {
    expect(resolveAgentName('my-agent')).toBe('my-agent');
  });

  it('uses global context set by _setWorkspaceContext when no workspace arg', () => {
    const ws = makeWorkspace(['ctx:agent-x']);
    _setWorkspaceContext(ws);
    expect(resolveAgentName('agent-x')).toBe('ctx:agent-x');
  });

  it('explicit workspace arg overrides global context', () => {
    _setWorkspaceContext(makeWorkspace(['global:agent']));
    const explicit = makeWorkspace(['explicit:agent']);
    expect(resolveAgentName('agent', explicit)).toBe('explicit:agent');
  });

  it('empty availableAgents → returns name as-is', () => {
    const ws = makeWorkspace([]);
    expect(resolveAgentName('alice', ws)).toBe('alice');
  });
});

// ── parseAgentSlug ────────────────────────────────────────────────────────────

describe('parseAgentSlug', () => {
  it('namespaced slug "ns:agent" → {namespace:"ns", name:"agent"}', () => {
    const result = parseAgentSlug('ns:agent');
    expect(result).toEqual({ namespace: 'ns', name: 'agent' });
  });

  it('plain slug "my-agent" → {name:"my-agent"} (no namespace)', () => {
    const result = parseAgentSlug('my-agent');
    expect(result).toEqual({ name: 'my-agent' });
  });
});

// ── isWorkspaceAgent ──────────────────────────────────────────────────────────

describe('isWorkspaceAgent', () => {
  it('"ns:agent" → true', () => {
    expect(isWorkspaceAgent('ns:agent')).toBe(true);
  });

  it('"plain-agent" → false', () => {
    expect(isWorkspaceAgent('plain-agent')).toBe(false);
  });
});
