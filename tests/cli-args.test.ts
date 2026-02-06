import { describe, expect, it } from 'vitest';
import { looksLikeTweetInput, resolveCliInvocation } from '../src/lib/cli-args.js';

describe('cli-args', () => {
  const known = new Set([
    'query-ids',
    'read',
    'replies',
    'thread',
    'search',
    'mentions',
    'bookmarks',
    'following',
    'followers',
    'likes',
    'help',
    'whoami',
    'check',
  ]);

  it('detects tweet URLs', () => {
    expect(looksLikeTweetInput('https://x.com/user/status/1234567890')).toBe(true);
    expect(looksLikeTweetInput('http://twitter.com/user/status/1234567890')).toBe(true);
    expect(looksLikeTweetInput('x.com/user/status/1234567890')).toBe(true);
  });

  it('detects numeric tweet ids', () => {
    expect(looksLikeTweetInput('1234567890')).toBe(true);
    expect(looksLikeTweetInput('123')).toBe(false);
  });

  it('returns help for empty args', () => {
    const result = resolveCliInvocation([], known);
    expect(result.showHelp).toBe(true);
    expect(result.argv).toBeNull();
  });

  it('rewrites bare tweet url to read command', () => {
    const result = resolveCliInvocation(['https://x.com/user/status/1234567890'], known);
    expect(result.showHelp).toBe(false);
    expect(result.argv).toEqual(['node', 'owlet', 'read', 'https://x.com/user/status/1234567890']);
  });

  it('rewrites bare tweet id to read command', () => {
    const result = resolveCliInvocation(['1234567890123456789'], known);
    expect(result.argv).toEqual(['node', 'owlet', 'read', '1234567890123456789']);
  });

  it('preserves leading options before inferred read command', () => {
    const result = resolveCliInvocation(['--plain', 'https://x.com/user/status/1234567890'], known);
    expect(result.argv).toEqual(['node', 'owlet', '--plain', 'read', 'https://x.com/user/status/1234567890']);
  });

  it('does not rewrite when a known command is provided', () => {
    const result = resolveCliInvocation(['read', 'https://x.com/user/status/1234567890'], known);
    expect(result.argv).toBeNull();
  });

  it('does not rewrite unknown commands', () => {
    const result = resolveCliInvocation(['https://example.com'], known);
    expect(result.argv).toBeNull();
    expect(result.showHelp).toBe(false);
  });
});
