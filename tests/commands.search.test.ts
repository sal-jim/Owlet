import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../src/cli/shared.js';
import { registerSearchCommands } from '../src/commands/search.js';
import { TwitterClient } from '../src/lib/twitter-client.js';

describe('search command', () => {
  let program: Command;
  let mockContext: Partial<CliContext>;

  beforeEach(() => {
    program = new Command();
    mockContext = {
      resolveTimeoutFromOptions: () => undefined,
      resolveQuoteDepthFromOptions: () => undefined,
      resolveCredentialsFromOptions: async () => ({
        cookies: { authToken: 'auth', ct0: 'ct0', cookieHeader: 'auth=auth; ct0=ct0' },
        warnings: [],
      }),
      p: () => '',
      printTweetsResult: vi.fn(),
    };
  });

  it('requires --all or --cursor when --max-pages is provided', async () => {
    registerSearchCommands(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'search', 'cats', '--max-pages', '2'])).rejects.toThrow(
        'exit 1',
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--max-pages requires --all or --cursor'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('requires positive --count when not paging', async () => {
    registerSearchCommands(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'search', 'cats', '--count', '0'])).rejects.toThrow('exit 1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid --count. Expected a positive integer.'));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('requires positive --max-pages when paging', async () => {
    registerSearchCommands(program, mockContext as CliContext);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(program.parseAsync(['node', 'owlet', 'search', 'cats', '--all', '--max-pages', '0'])).rejects.toThrow(
        'exit 1',
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid --max-pages. Expected a positive integer.'),
      );
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('uses paged search when --all is set', async () => {
    registerSearchCommands(program, mockContext as CliContext);
    const getAllSpy = vi
      .spyOn(TwitterClient.prototype, 'getAllSearchResults')
      .mockResolvedValue({ success: true, tweets: [] });
    const searchSpy = vi.spyOn(TwitterClient.prototype, 'search').mockResolvedValue({ success: true, tweets: [] });

    try {
      await program.parseAsync(['node', 'owlet', 'search', 'cats', '--all', '--json']);
      expect(getAllSpy).toHaveBeenCalledWith('cats', expect.objectContaining({ includeRaw: false }));
      expect(searchSpy).not.toHaveBeenCalled();
      expect(mockContext.printTweetsResult).toHaveBeenCalledWith(expect.objectContaining({ tweets: [] }), {
        json: true,
        usePagination: true,
        emptyMessage: 'No tweets found.',
      });
    } finally {
      getAllSpy.mockRestore();
      searchSpy.mockRestore();
    }
  });

  it('uses cursor pagination when --cursor is set', async () => {
    registerSearchCommands(program, mockContext as CliContext);
    const getAllSpy = vi
      .spyOn(TwitterClient.prototype, 'getAllSearchResults')
      .mockResolvedValue({ success: true, tweets: [] });

    try {
      await program.parseAsync(['node', 'owlet', 'search', 'cats', '--cursor', 'cursor-1']);
      expect(getAllSpy).toHaveBeenCalledWith('cats', expect.objectContaining({ cursor: 'cursor-1' }));
      expect(mockContext.printTweetsResult).toHaveBeenCalledWith(expect.objectContaining({ tweets: [] }), {
        json: false,
        usePagination: true,
        emptyMessage: 'No tweets found.',
      });
    } finally {
      getAllSpy.mockRestore();
    }
  });
});
