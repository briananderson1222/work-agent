import { describe, expect, it } from 'vitest';
import {
  extractPluginName,
  isGitUrl,
  parseGitSource,
} from '../commands/helpers.js';

describe('isGitUrl', () => {
  it('recognises git@ SSH URLs', () => {
    expect(isGitUrl('git@github.com:org/repo.git')).toBe(true);
  });

  it('recognises .git-suffixed HTTPS URLs', () => {
    expect(isGitUrl('https://example.com/org/repo.git')).toBe(true);
  });

  it('recognises GitHub HTTPS URLs without .git suffix', () => {
    expect(isGitUrl('https://github.com/org/repo')).toBe(true);
  });

  it('recognises GitLab HTTPS URLs without .git suffix', () => {
    expect(isGitUrl('https://gitlab.com/org/repo')).toBe(true);
  });

  it('rejects plain HTTPS URLs unrelated to git hosts', () => {
    expect(isGitUrl('https://example.com/plugin')).toBe(false);
  });

  it('rejects unix-style local paths', () => {
    expect(isGitUrl('/home/user/plugins/my-plugin')).toBe(false);
  });

  it('rejects relative local paths', () => {
    expect(isGitUrl('./my-plugin')).toBe(false);
  });

  it('rejects windows-style local paths', () => {
    const p = ['C:', 'Users', 'dev', 'plugins', 'my-plugin'].join('\\');
    expect(isGitUrl(p)).toBe(false);
  });
});

describe('parseGitSource', () => {
  it('splits URL and branch on #', () => {
    const result = parseGitSource('https://github.com/org/repo.git#feat/branch');
    expect(result.url).toBe('https://github.com/org/repo.git');
    expect(result.branch).toBe('feat/branch');
  });

  it('defaults branch to main when no # present', () => {
    const result = parseGitSource('https://github.com/org/repo.git');
    expect(result.url).toBe('https://github.com/org/repo.git');
    expect(result.branch).toBe('main');
  });
});

describe('extractPluginName', () => {
  it('extracts name from unix local path', () => {
    expect(extractPluginName('/home/user/plugins/my-plugin')).toBe('my-plugin');
  });

  it('extracts name from windows local path (backslash)', () => {
    const p = ['C:', 'Users', 'user', 'plugins', 'my-plugin'].join('\\');
    expect(extractPluginName(p)).toBe('my-plugin');
  });

  it('extracts name from git URL with .git suffix', () => {
    expect(
      extractPluginName('https://github.com/org/awesome-plugin.git'),
    ).toBe('awesome-plugin');
  });

  it('extracts name from git URL without .git suffix', () => {
    expect(
      extractPluginName('https://github.com/org/awesome-plugin'),
    ).toBe('awesome-plugin');
  });

  it('extracts name from git URL with branch fragment', () => {
    expect(
      extractPluginName('https://github.com/org/my-plugin.git#main'),
    ).toBe('my-plugin');
  });

  it('extracts name from SSH git URL', () => {
    expect(extractPluginName('git@github.com:org/my-plugin.git')).toBe(
      'my-plugin',
    );
  });

  it('handles trailing slash on local path', () => {
    // basename('foo/bar/') → '' on some impls; we want 'bar'
    // path.basename handles this correctly
    expect(extractPluginName('/home/user/plugins/my-plugin/')).toBe(
      'my-plugin',
    );
  });
});
