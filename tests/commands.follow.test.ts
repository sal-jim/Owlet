import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../src/cli/shared.js';
import { registerFollowCommands } from '../src/commands/follow.js';
import { TwitterClient } from '../src/lib/twitter-client.js';

const baseCtx = {
  resolveTimeoutFromOptions: () => undefined,
  resolveCredentialsFromOptions: async () => ({
    cookies: { authToken: 'auth', ct0: 'ct0', cookieHeader: 'auth=auth; ct0=ct0' },
    warnings: [],
  }),
  p: () => '',
} as unknown as CliContext;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('follow commands', () => {
  it('prefers username lookup for numeric handles', async () => {
    const program = new Command();
    registerFollowCommands(program, baseCtx);

    const lookupSpy = vi.spyOn(TwitterClient.prototype, 'getUserIdByUsername').mockResolvedValue({
      success: true,
      userId: '999',
      username: '12345',
    });
    const followSpy = vi.spyOn(TwitterClient.prototype, 'follow').mockResolvedValue({ success: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await program.parseAsync(['node', 'owlet', 'follow', '12345']);

    expect(lookupSpy).toHaveBeenCalledWith('12345');
    expect(followSpy).toHaveBeenCalledWith('999');
  });

  it('falls back to numeric user IDs when lookup fails', async () => {
    const program = new Command();
    registerFollowCommands(program, baseCtx);

    vi.spyOn(TwitterClient.prototype, 'getUserIdByUsername').mockResolvedValue({
      success: false,
      error: 'User not found',
    });
    const followSpy = vi.spyOn(TwitterClient.prototype, 'follow').mockResolvedValue({ success: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await program.parseAsync(['node', 'owlet', 'follow', '12345']);

    expect(followSpy).toHaveBeenCalledWith('12345');
  });
});
