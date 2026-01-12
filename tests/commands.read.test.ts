import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../src/cli/shared.js';
import { registerReadCommands } from '../src/commands/read.js';
import { TwitterClient } from '../src/lib/twitter-client.js';

describe('replies command', () => {
  const createMockContext = () =>
    ({
      resolveTimeoutFromOptions: () => undefined,
      resolveQuoteDepthFromOptions: () => 1,
      extractTweetId: (input: string) => input,
      resolveCredentialsFromOptions: async () => ({
        cookies: { authToken: 'auth', ct0: 'ct0', cookieHeader: 'auth=auth; ct0=ct0' },
        warnings: [],
      }),
      p: () => '',
      printTweets: () => undefined,
      printTweetsResult: () => undefined,
    }) as unknown as CliContext;

  it('uses pagination when --max-pages is provided', async () => {
    const program = new Command();
    registerReadCommands(program, createMockContext());

    const pagedSpy = vi
      .spyOn(TwitterClient.prototype, 'getRepliesPaged')
      .mockResolvedValue({ success: true, tweets: [], nextCursor: undefined });
    const unpagedSpy = vi.spyOn(TwitterClient.prototype, 'getReplies').mockResolvedValue({ success: true, tweets: [] });

    try {
      await program.parseAsync(['node', 'bird', 'replies', '123', '--max-pages', '2', '--json']);
      expect(pagedSpy).toHaveBeenCalledTimes(1);
      expect(unpagedSpy).toHaveBeenCalledTimes(0);
    } finally {
      pagedSpy.mockRestore();
      unpagedSpy.mockRestore();
    }
  });

  it('validates --max-pages is a positive integer', async () => {
    const program = new Command();
    registerReadCommands(program, createMockContext());

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        program.parseAsync(['node', 'bird', 'replies', '123', '--all', '--max-pages', '-1']),
      ).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid --max-pages'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('validates --delay is a non-negative integer', async () => {
    const program = new Command();
    registerReadCommands(program, createMockContext());

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'bird', 'replies', '123', '--all', '--delay', '-100'])).rejects.toThrow(
        'exit 1',
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid --delay'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('thread command', () => {
  const createMockContext = () =>
    ({
      resolveTimeoutFromOptions: () => undefined,
      resolveQuoteDepthFromOptions: () => 1,
      extractTweetId: (input: string) => input,
      resolveCredentialsFromOptions: async () => ({
        cookies: { authToken: 'auth', ct0: 'ct0', cookieHeader: 'auth=auth; ct0=ct0' },
        warnings: [],
      }),
      p: () => '',
      printTweets: () => undefined,
      printTweetsResult: () => undefined,
    }) as unknown as CliContext;

  it('uses pagination when --max-pages is provided', async () => {
    const program = new Command();
    registerReadCommands(program, createMockContext());

    const pagedSpy = vi
      .spyOn(TwitterClient.prototype, 'getThreadPaged')
      .mockResolvedValue({ success: true, tweets: [], nextCursor: undefined });
    const unpagedSpy = vi.spyOn(TwitterClient.prototype, 'getThread').mockResolvedValue({ success: true, tweets: [] });

    try {
      await program.parseAsync(['node', 'bird', 'thread', '123', '--max-pages', '2', '--json']);
      expect(pagedSpy).toHaveBeenCalledTimes(1);
      expect(unpagedSpy).toHaveBeenCalledTimes(0);
    } finally {
      pagedSpy.mockRestore();
      unpagedSpy.mockRestore();
    }
  });

  it('validates --max-pages is a positive integer', async () => {
    const program = new Command();
    registerReadCommands(program, createMockContext());

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'bird', 'thread', '123', '--all', '--max-pages', '0'])).rejects.toThrow(
        'exit 1',
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid --max-pages'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('validates --delay is a non-negative integer', async () => {
    const program = new Command();
    registerReadCommands(program, createMockContext());

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'bird', 'thread', '123', '--all', '--delay', 'abc'])).rejects.toThrow(
        'exit 1',
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid --delay'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
