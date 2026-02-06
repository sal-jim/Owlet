import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../src/cli/shared.js';
import { registerUserCommands } from '../src/commands/users.js';
import { TwitterClient } from '../src/lib/twitter-client.js';

const baseCtx = {
  resolveTimeoutFromOptions: () => undefined,
  resolveCredentialsFromOptions: async () => ({
    cookies: { authToken: 'auth', ct0: 'ct0', cookieHeader: 'auth=auth; ct0=ct0' },
    warnings: [],
  }),
  p: () => '',
  printTweets: () => undefined,
} as unknown as CliContext;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('users commands', () => {
  it('requires --all when --max-pages is provided', async () => {
    const program = new Command();
    registerUserCommands(program, baseCtx);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'following', '--max-pages', '2'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--max-pages requires --all.'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('rejects --max-pages when only --cursor is provided', async () => {
    const program = new Command();
    registerUserCommands(program, baseCtx);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        program.parseAsync(['node', 'owlet', 'following', '--cursor', 'prev', '--max-pages', '2']),
      ).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--max-pages requires --all.'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('emits pagination JSON when --cursor is provided', async () => {
    const program = new Command();
    registerUserCommands(program, baseCtx);
    vi.spyOn(TwitterClient.prototype, 'getCurrentUser').mockResolvedValue({
      success: true,
      user: { id: '123', username: 'tester', name: 'Tester' },
    });
    vi.spyOn(TwitterClient.prototype, 'getFollowing').mockResolvedValue({
      success: true,
      users: [{ id: '1', username: 'alpha', name: 'Alpha' }],
      nextCursor: 'next-1',
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await program.parseAsync(['node', 'owlet', 'following', '--cursor', 'prev', '--json']);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.users).toHaveLength(1);
    expect(payload.nextCursor).toBe('next-1');
  });

  it('prints next cursor in non-JSON single-page mode', async () => {
    const program = new Command();
    registerUserCommands(program, baseCtx);
    vi.spyOn(TwitterClient.prototype, 'getCurrentUser').mockResolvedValue({
      success: true,
      user: { id: '123', username: 'tester', name: 'Tester' },
    });
    vi.spyOn(TwitterClient.prototype, 'getFollowing').mockResolvedValue({
      success: true,
      users: [{ id: '1', username: 'alpha', name: 'Alpha' }],
      nextCursor: 'next-1',
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await program.parseAsync(['node', 'owlet', 'following', '--cursor', 'prev']);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Next cursor: next-1'));
    expect(logSpy).toHaveBeenCalled();
  });

  it('emits pagination JSON for --all results', async () => {
    const program = new Command();
    registerUserCommands(program, baseCtx);
    vi.spyOn(TwitterClient.prototype, 'getCurrentUser').mockResolvedValue({
      success: true,
      user: { id: '123', username: 'tester', name: 'Tester' },
    });
    vi.spyOn(TwitterClient.prototype, 'getFollowing').mockResolvedValue({
      success: true,
      users: [{ id: '1', username: 'alpha', name: 'Alpha' }],
      nextCursor: 'next-1',
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await program.parseAsync(['node', 'owlet', 'following', '--all', '--max-pages', '1', '--json']);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.users).toHaveLength(1);
    expect(payload.nextCursor).toBe('next-1');
  });

  it('prints next cursor when stopping at max pages in non-JSON mode', async () => {
    vi.useFakeTimers();
    const program = new Command();
    registerUserCommands(program, baseCtx);
    vi.spyOn(TwitterClient.prototype, 'getCurrentUser').mockResolvedValue({
      success: true,
      user: { id: '123', username: 'tester', name: 'Tester' },
    });
    vi.spyOn(TwitterClient.prototype, 'getFollowing').mockResolvedValue({
      success: true,
      users: [{ id: '1', username: 'alpha', name: 'Alpha' }],
      nextCursor: 'next-1',
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const run = program.parseAsync(['node', 'owlet', 'following', '--all', '--max-pages', '1']);
    await vi.advanceTimersByTimeAsync(1000);
    await run;

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Next cursor: next-1'));
    expect(logSpy).toHaveBeenCalled();
  });

  it('deduplicates users across pages in --all mode', async () => {
    vi.useFakeTimers();
    const program = new Command();
    registerUserCommands(program, baseCtx);
    vi.spyOn(TwitterClient.prototype, 'getCurrentUser').mockResolvedValue({
      success: true,
      user: { id: '123', username: 'tester', name: 'Tester' },
    });
    const followingSpy = vi.spyOn(TwitterClient.prototype, 'getFollowing');
    followingSpy
      .mockResolvedValueOnce({
        success: true,
        users: [
          { id: '1', username: 'alpha', name: 'Alpha' },
          { id: '2', username: 'beta', name: 'Beta' },
        ],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        success: true,
        users: [
          { id: '2', username: 'beta', name: 'Beta' },
          { id: '3', username: 'gamma', name: 'Gamma' },
        ],
        nextCursor: undefined,
      });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const run = program.parseAsync(['node', 'owlet', 'following', '--all', '--json']);
    await vi.advanceTimersByTimeAsync(1000);
    await run;

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.users).toHaveLength(3);
    expect(payload.users.map((user: { id: string }) => user.id)).toEqual(['1', '2', '3']);
  });

  it('stops pagination when cursor repeats or no new users are added', async () => {
    vi.useFakeTimers();
    const program = new Command();
    registerUserCommands(program, baseCtx);
    vi.spyOn(TwitterClient.prototype, 'getCurrentUser').mockResolvedValue({
      success: true,
      user: { id: '123', username: 'tester', name: 'Tester' },
    });
    const followingSpy = vi.spyOn(TwitterClient.prototype, 'getFollowing');
    followingSpy
      .mockResolvedValueOnce({
        success: true,
        users: [{ id: '1', username: 'alpha', name: 'Alpha' }],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        success: true,
        users: [{ id: '1', username: 'alpha', name: 'Alpha' }],
        nextCursor: 'cursor-1',
      });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const run = program.parseAsync(['node', 'owlet', 'following', '--all', '--json']);
    await vi.advanceTimersByTimeAsync(1000);
    await run;

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.users).toHaveLength(1);
    expect(payload.nextCursor).toBeNull();
    expect(followingSpy).toHaveBeenCalledTimes(2);
  });
});
