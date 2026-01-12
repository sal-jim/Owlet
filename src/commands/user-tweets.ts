import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { normalizeHandle } from '../lib/normalize-handle.js';
import { TwitterClient } from '../lib/twitter-client.js';

export function registerUserTweetsCommand(program: Command, ctx: CliContext): void {
  const formatExample = (cmd: string, desc: string): string =>
    `  ${ctx.colors.command(cmd)}\n    ${ctx.colors.muted(desc)}`;

  program
    .command('user-tweets')
    .description("Get tweets from a user's profile timeline")
    .argument('<handle>', 'Username to fetch tweets from (e.g., @steipete or steipete)')
    .option('-n, --count <number>', 'Number of tweets to fetch', '20')
    .option('--max-pages <number>', 'Stop after N pages (max: 10)')
    .option('--delay <ms>', 'Delay in ms between page fetches', '1000')
    .option('--cursor <string>', 'Resume pagination from a cursor')
    .option('--json', 'Output as JSON')
    .option('--json-full', 'Output as JSON with full raw API response in _raw field')
    .addHelpText(
      'after',
      () =>
        `\n${ctx.colors.section('Command Examples')}\n${[
          formatExample('bird user-tweets @steipete', 'Get recent tweets from a user'),
          formatExample('bird user-tweets steipete -n 10', 'Get 10 tweets (@ is optional)'),
          formatExample('bird user-tweets @steipete -n 50', 'Fetch 50 tweets (paged)'),
          formatExample('bird user-tweets @steipete --max-pages 3 -n 200', 'Safety cap (max 3 pages)'),
          formatExample('bird user-tweets @steipete --json', 'Output as JSON'),
          formatExample('bird user-tweets @steipete --cursor "DAABCg..."', 'Resume from cursor'),
        ].join('\n')}`,
    )
    .action(
      async (
        handle: string,
        cmdOpts: {
          count?: string;
          maxPages?: string;
          delay?: string;
          cursor?: string;
          json?: boolean;
          jsonFull?: boolean;
        },
      ) => {
        const opts = program.opts();
        const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
        const quoteDepth = ctx.resolveQuoteDepthFromOptions(opts);
        const count = Number.parseInt(cmdOpts.count || '20', 10);
        const maxPages = cmdOpts.maxPages ? Number.parseInt(cmdOpts.maxPages, 10) : undefined;
        const pageDelayMs = Number.parseInt(cmdOpts.delay || '1000', 10);

        // Validate inputs
        if (!Number.isFinite(count) || count <= 0) {
          console.error(`${ctx.p('err')}Invalid --count. Expected a positive integer.`);
          process.exit(2);
        }
        const pageSize = 20;
        const hardMaxPages = 10;
        const hardMaxTweets = pageSize * hardMaxPages;
        if (count > hardMaxTweets) {
          console.error(
            `${ctx.p('err')}Invalid --count. Max ${hardMaxTweets} tweets per run (safety cap: ${hardMaxPages} pages). Use --cursor to continue.`,
          );
          process.exit(2);
        }
        if (maxPages !== undefined && (!Number.isFinite(maxPages) || maxPages <= 0 || maxPages > hardMaxPages)) {
          console.error(`${ctx.p('err')}Invalid --max-pages. Expected a positive integer (max: ${hardMaxPages}).`);
          process.exit(2);
        }
        if (!Number.isFinite(pageDelayMs) || pageDelayMs < 0) {
          console.error(`${ctx.p('err')}Invalid --delay. Expected a non-negative integer.`);
          process.exit(2);
        }

        // Normalize handle (strip @ if present)
        const username = normalizeHandle(handle);
        if (!username) {
          console.error(`${ctx.p('err')}Invalid handle: ${handle}`);
          process.exit(2);
        }

        const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);

        for (const warning of warnings) {
          console.error(`${ctx.p('warn')}${warning}`);
        }

        if (!cookies.authToken || !cookies.ct0) {
          console.error(`${ctx.p('err')}Missing required credentials`);
          process.exit(1);
        }

        const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });

        // Look up user ID from username
        console.error(`${ctx.p('info')}Looking up @${username}...`);
        const userLookup = await client.getUserIdByUsername(username);
        if (!userLookup.success || !userLookup.userId) {
          console.error(`${ctx.p('err')}${userLookup.error || `Could not find user @${username}`}`);
          process.exit(1);
        }

        const displayName = userLookup.name
          ? `${userLookup.name} (@${userLookup.username})`
          : `@${userLookup.username}`;
        console.error(`${ctx.p('info')}Fetching tweets from ${displayName}...`);

        const includeRaw = cmdOpts.jsonFull ?? false;
        const wantsPaginationOutput = Boolean(cmdOpts.cursor) || maxPages !== undefined || count > pageSize;
        const result = await client.getUserTweetsPaged(userLookup.userId, count, {
          includeRaw,
          maxPages,
          cursor: cmdOpts.cursor,
          pageDelayMs,
        });

        if (result.success && result.tweets) {
          const isJson = Boolean(cmdOpts.json || cmdOpts.jsonFull);
          ctx.printTweetsResult(result, {
            json: isJson,
            usePagination: wantsPaginationOutput,
            emptyMessage: `No tweets found for @${username}.`,
          });

          // Show pagination hint if there's more
          if (result.nextCursor && !cmdOpts.json && !cmdOpts.jsonFull) {
            console.error(`${ctx.p('info')}More tweets available. Use --cursor "${result.nextCursor}" to continue.`);
          }
        } else {
          console.error(`${ctx.p('err')}Failed to fetch tweets: ${result.error}`);
          process.exit(1);
        }
      },
    );
}
