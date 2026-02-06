import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../src/cli/shared.js';
import { registerNewsCommand } from '../src/commands/news.js';
import { TwitterClient } from '../src/lib/twitter-client.js';

describe('news command', () => {
  let program: Command;
  let mockContext: Partial<CliContext>;

  beforeEach(() => {
    program = new Command();
    mockContext = {
      resolveTimeoutFromOptions: () => 30000,
      resolveQuoteDepthFromOptions: () => undefined,
      resolveCredentialsFromOptions: async () => ({
        cookies: {
          authToken: 'auth',
          ct0: 'ct0',
          cookieHeader: 'auth=auth; ct0=ct0',
        },
        warnings: [],
      }),
      p: (type: string) => `[${type}] `,
      colors: {
        accent: (text: string) => text,
        command: (text: string) => text,
        muted: (text: string) => text,
        section: (text: string) => text,
      },
      l: (key: string) => key,
    };
  });

  it('requires positive count value', async () => {
    registerNewsCommand(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'news', '--count', '0'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--count must be a positive number'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('rejects negative count value', async () => {
    registerNewsCommand(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'news', '--count', '-5'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--count must be a positive number'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('rejects non-numeric count value', async () => {
    registerNewsCommand(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'news', '--count', 'abc'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--count must be a positive number'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('requires positive tweets-per-item value', async () => {
    registerNewsCommand(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'news', '--tweets-per-item', '0'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--tweets-per-item must be a positive number'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('rejects negative tweets-per-item value', async () => {
    registerNewsCommand(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'news', '--tweets-per-item', '-3'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--tweets-per-item must be a positive number'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('rejects non-numeric tweets-per-item value', async () => {
    registerNewsCommand(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'news', '--tweets-per-item', 'xyz'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--tweets-per-item must be a positive number'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('requires both authToken and ct0 credentials', async () => {
    mockContext.resolveCredentialsFromOptions = async () => ({
      cookies: {
        authToken: '',
        ct0: '',
        cookieHeader: '',
      },
      warnings: [],
    });

    registerNewsCommand(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'news'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Missing required credentials'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('limits related tweets to tweets-per-item in CLI output', async () => {
    registerNewsCommand(program, mockContext as CliContext);
    const getNewsSpy = vi.spyOn(TwitterClient.prototype, 'getNews').mockResolvedValue({
      success: true,
      items: [
        {
          id: 'item-1',
          headline: 'News headline',
          category: 'News',
          tweets: [
            { id: 't1', text: 'first tweet', author: { username: 'a', name: 'A' } },
            { id: 't2', text: 'second tweet', author: { username: 'b', name: 'B' } },
            { id: 't3', text: 'third tweet', author: { username: 'c', name: 'C' } },
          ],
        },
      ],
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await program.parseAsync(['node', 'owlet', 'news', '--with-tweets', '--tweets-per-item', '2', '--count', '1']);
      expect(getNewsSpy).toHaveBeenCalledWith(1, expect.objectContaining({ tweetsPerItem: 2, withTweets: true }));
      const tweetLines = logSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.trimStart().startsWith('@'));
      expect(tweetLines).toHaveLength(2);
    } finally {
      getNewsSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
