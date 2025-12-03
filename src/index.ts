#!/usr/bin/env node
/**
 * bird - CLI tool for posting tweets and replies
 *
 * Usage:
 *   bird tweet "Hello world!"
 *   bird reply <tweet-id> "This is a reply"
 *   bird reply <tweet-url> "This is a reply"
 *   bird read <tweet-id-or-url>
 */

import { Command } from 'commander';
import JSON5 from 'json5';
import kleur from 'kleur';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCredentials } from './lib/cookies.js';
import { extractTweetId } from './lib/extract-tweet-id.js';
import { TwitterClient, type TweetData } from './lib/twitter-client.js';
import { SweetisticsClient } from './lib/sweetistics-client.js';

const program = new Command();

const isTty = process.stdout.isTTY;
const wrap = (styler: (text: string) => string) => (text: string) => (isTty ? styler(text) : text);

const colors = {
  banner: wrap((t) => kleur.bold().blue(t)),
  subtitle: wrap((t) => kleur.dim(t)),
  section: wrap((t) => kleur.bold().white(t)),
  bullet: wrap((t) => kleur.blue(t)),
  command: wrap((t) => kleur.bold().cyan(t)),
  option: wrap((t) => kleur.cyan(t)),
  argument: wrap((t) => kleur.magenta(t)),
  description: wrap((t) => kleur.white(t)),
  muted: wrap((t) => kleur.gray(t)),
  accent: wrap((t) => kleur.green(t)),
};

type BirdConfig = {
  engine?: EngineMode;
  chromeProfile?: string;
  firefoxProfile?: string;
  sweetisticsApiKey?: string;
  sweetisticsBaseUrl?: string;
};

function readConfigFile(path: string): Partial<BirdConfig> {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON5.parse(raw) as Partial<BirdConfig>;
    return parsed ?? {};
  } catch (error) {
    console.error(colors.muted(`⚠️  Failed to parse config at ${path}: ${error instanceof Error ? error.message : String(error)}`));
    return {};
  }
}

function loadConfig(): BirdConfig {
  const globalPath = join(homedir(), '.config', 'bird', 'config.json5');
  const localPath = join(process.cwd(), '.birdrc.json5');

  return {
    ...readConfigFile(globalPath),
    ...readConfigFile(localPath),
  };
}

const config = loadConfig();

program.addHelpText('beforeAll', () => `${colors.banner('bird CLI')} ${colors.subtitle('— tweet from your terminal')}`);

program.name('bird').description('Post tweets and replies via Twitter/X GraphQL API').version('0.1.0');

const formatExample = (command: string, description: string) =>
  `${colors.command(`  ${command}`)}\n${colors.muted(`    ${description}`)}`;

program.addHelpText(
  'afterAll',
  () => `\n${colors.section('Examples')}\n${[
    formatExample('bird whoami', 'Show the logged-in account via GraphQL cookies'),
    formatExample('bird --firefox-profile default-release whoami', 'Use Firefox profile cookies'),
    formatExample('bird tweet "hello from bird"', 'Send a tweet'),
    formatExample('bird replies https://x.com/user/status/1234567890123456789', 'Check replies to a tweet'),
  ].join('\n\n')}`,
);

// Global options for authentication
program
  .option('--auth-token <token>', 'Twitter auth_token cookie')
  .option('--ct0 <token>', 'Twitter ct0 cookie')
  .option('--chrome-profile <name>', 'Chrome profile name for cookie extraction', config.chromeProfile)
  .option('--firefox-profile <name>', 'Firefox profile name for cookie extraction', config.firefoxProfile)
  .option('--sweetistics-api-key <key>', 'Sweetistics API key (or set SWEETISTICS_API_KEY)')
  .option(
    '--sweetistics-base-url <url>',
    'Sweetistics base URL',
    config.sweetisticsBaseUrl || process.env.SWEETISTICS_BASE_URL || 'https://sweetistics.com',
  )
  .option(
    '--engine <engine>',
    'Engine: graphql | sweetistics | auto',
    process.env.BIRD_ENGINE || config.engine || 'auto',
  );

type EngineMode = 'graphql' | 'sweetistics' | 'auto';

function resolveSweetisticsConfig(options: { sweetisticsApiKey?: string; sweetisticsBaseUrl?: string }) {
  const apiKey =
    options.sweetisticsApiKey ||
    process.env.SWEETISTICS_API_KEY ||
    process.env.SWEETISTICS_LOCALHOST_API_KEY ||
    null;

  const baseUrl = options.sweetisticsBaseUrl || process.env.SWEETISTICS_BASE_URL || 'https://sweetistics.com';

  return { apiKey, baseUrl };
}

function resolveEngineMode(value?: string): EngineMode {
  const normalized = (value || 'auto').toLowerCase();
  if (normalized === 'graphql' || normalized === 'sweetistics' || normalized === 'auto') {
    return normalized;
  }
  return 'auto';
}

function shouldUseSweetistics(engine: EngineMode, hasApiKey: boolean): boolean {
  if (engine === 'sweetistics') return true;
  if (engine === 'graphql') return false;
  return hasApiKey; // auto
}

function printTweets(
  tweets: TweetData[],
  opts: { json?: boolean; emptyMessage?: string; showSeparator?: boolean } = {},
) {
  if (opts.json) {
    console.log(JSON.stringify(tweets, null, 2));
    return;
  }
  if (tweets.length === 0) {
    console.log(opts.emptyMessage ?? 'No tweets found.');
    return;
  }
  for (const tweet of tweets) {
    console.log(`\n@${tweet.author.username} (${tweet.author.name}):`);
    console.log(tweet.text);
    if (tweet.createdAt) {
      console.log(`📅 ${tweet.createdAt}`);
    }
    console.log(`🔗 https://x.com/${tweet.author.username}/status/${tweet.id}`);
    if (opts.showSeparator ?? true) {
      console.log('─'.repeat(50));
    }
  }
}

// Tweet command
program
  .command('tweet')
  .description('Post a new tweet')
  .argument('<text>', 'Tweet text')
  .action(async (text: string) => {
    const opts = program.opts();
    const sweetistics = resolveSweetisticsConfig({
      sweetisticsApiKey: opts.sweetisticsApiKey || config.sweetisticsApiKey,
      sweetisticsBaseUrl: opts.sweetisticsBaseUrl || config.sweetisticsBaseUrl,
    });
    const engine = resolveEngineMode(opts.engine);
    const useSweetistics = shouldUseSweetistics(engine, Boolean(sweetistics.apiKey));

    if (useSweetistics) {
      if (!sweetistics.apiKey) {
        console.error('❌ Sweetistics engine selected but no API key provided.');
        process.exit(1);
      }
      try {
        const client = new SweetisticsClient({
          baseUrl: sweetistics.baseUrl,
          apiKey: sweetistics.apiKey,
        });
        const result = await client.tweet(text);
        if (result.success) {
          console.log('✅ Tweet posted via Sweetistics!');
          if (result.tweetId) {
            console.log(`🔗 https://x.com/i/status/${result.tweetId}`);
          }
          return;
        }
        console.error(`❌ Sweetistics post failed: ${result.error ?? 'Unknown error'}`);
        process.exit(1);
      } catch (error) {
        console.error(`❌ Sweetistics error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }

    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile || config.chromeProfile,
      firefoxProfile: opts.firefoxProfile || config.firefoxProfile,
    });

    for (const warning of warnings) {
      console.error(`⚠️  ${warning}`);
    }

    if (!cookies.authToken || !cookies.ct0) {
      console.error('❌ Missing required credentials');
      process.exit(1);
    }

    if (cookies.source) {
      console.error(`📍 Using credentials from: ${cookies.source}`);
    }

    const client = new TwitterClient({ cookies });
    const result = await client.tweet(text);

    if (result.success) {
      console.log('✅ Tweet posted successfully!');
      console.log(`🔗 https://x.com/i/status/${result.tweetId}`);
    } else {
      console.error(`❌ Failed to post tweet: ${result.error}`);
      process.exit(1);
    }
  });

// Reply command
program
  .command('reply')
  .description('Reply to an existing tweet')
  .argument('<tweet-id-or-url>', 'Tweet ID or URL to reply to')
  .argument('<text>', 'Reply text')
  .action(async (tweetIdOrUrl: string, text: string) => {
    const opts = program.opts();
    const sweetistics = resolveSweetisticsConfig({
      sweetisticsApiKey: opts.sweetisticsApiKey || config.sweetisticsApiKey,
      sweetisticsBaseUrl: opts.sweetisticsBaseUrl || config.sweetisticsBaseUrl,
    });
    const engine = resolveEngineMode(opts.engine);
    const useSweetistics = shouldUseSweetistics(engine, Boolean(sweetistics.apiKey));
    const tweetId = extractTweetId(tweetIdOrUrl);

    if (useSweetistics) {
      if (!sweetistics.apiKey) {
        console.error('❌ Sweetistics engine selected but no API key provided.');
        process.exit(1);
      }
      try {
        const client = new SweetisticsClient({
          baseUrl: sweetistics.baseUrl,
          apiKey: sweetistics.apiKey,
        });
        const result = await client.tweet(text, tweetId);
        if (result.success) {
          console.log('✅ Reply posted via Sweetistics!');
          if (result.tweetId) {
            console.log(`🔗 https://x.com/i/status/${result.tweetId}`);
          }
          return;
        }
        console.error(`❌ Sweetistics reply failed: ${result.error ?? 'Unknown error'}`);
        process.exit(1);
      } catch (error) {
        console.error(`❌ Sweetistics error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }

    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile || config.chromeProfile,
      firefoxProfile: opts.firefoxProfile || config.firefoxProfile,
    });

    for (const warning of warnings) {
      console.error(`⚠️  ${warning}`);
    }

    if (!cookies.authToken || !cookies.ct0) {
      console.error('❌ Missing required credentials');
      process.exit(1);
    }

    if (cookies.source) {
      console.error(`📍 Using credentials from: ${cookies.source}`);
    }

    console.error(`📝 Replying to tweet: ${tweetId}`);

    const client = new TwitterClient({ cookies });
    const result = await client.reply(text, tweetId);

    if (result.success) {
      console.log('✅ Reply posted successfully!');
      console.log(`🔗 https://x.com/i/status/${result.tweetId}`);
    } else {
      console.error(`❌ Failed to post reply: ${result.error}`);
      process.exit(1);
    }
  });

// Read command - fetch tweet content
program
  .command('read')
  .description('Read/fetch a tweet by ID or URL')
  .argument('<tweet-id-or-url>', 'Tweet ID or URL to read')
  .option('--json', 'Output as JSON')
  .action(async (tweetIdOrUrl: string, cmdOpts: { json?: boolean }) => {
    const opts = program.opts();
    const sweetistics = resolveSweetisticsConfig({
      sweetisticsApiKey: opts.sweetisticsApiKey || config.sweetisticsApiKey,
      sweetisticsBaseUrl: opts.sweetisticsBaseUrl || config.sweetisticsBaseUrl,
    });
    const engine = resolveEngineMode(opts.engine);
    const useSweetistics = shouldUseSweetistics(engine, Boolean(sweetistics.apiKey));

    const tweetId = extractTweetId(tweetIdOrUrl);
    if (useSweetistics) {
      if (!sweetistics.apiKey) {
        console.error('❌ Sweetistics engine selected but no API key provided.');
        process.exit(1);
      }
      const client = new SweetisticsClient({ baseUrl: sweetistics.baseUrl, apiKey: sweetistics.apiKey });
      const result = await client.read(tweetId);
      if (result.success && result.tweet) {
        if (cmdOpts.json) {
          console.log(JSON.stringify(result.tweet, null, 2));
        } else {
          console.log(`@${result.tweet.author.username} (${result.tweet.author.name}):`);
          console.log(result.tweet.text);
          if (result.tweet.createdAt) {
            console.log(`\n📅 ${result.tweet.createdAt}`);
          }
          console.log(
            `❤️ ${result.tweet.likeCount ?? 0}  🔁 ${result.tweet.retweetCount ?? 0}  💬 ${result.tweet.replyCount ?? 0}`,
          );
        }
        return;
      }
      console.error(`❌ Failed to read tweet via Sweetistics: ${result.error ?? 'Unknown error'}`);
      process.exit(1);
    }

    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile || config.chromeProfile,
      firefoxProfile: opts.firefoxProfile || config.firefoxProfile,
    });

    for (const warning of warnings) {
      console.error(`⚠️  ${warning}`);
    }

    if (!cookies.authToken || !cookies.ct0) {
      console.error('❌ Missing required credentials');
      process.exit(1);
    }

    const client = new TwitterClient({ cookies });
    const result = await client.getTweet(tweetId);

    if (result.success && result.tweet) {
      if (cmdOpts.json) {
        console.log(JSON.stringify(result.tweet, null, 2));
      } else {
        console.log(`@${result.tweet.author.username} (${result.tweet.author.name}):`);
        console.log(result.tweet.text);
        if (result.tweet.createdAt) {
          console.log(`\n📅 ${result.tweet.createdAt}`);
        }
        console.log(
          `❤️ ${result.tweet.likeCount ?? 0}  🔁 ${result.tweet.retweetCount ?? 0}  💬 ${result.tweet.replyCount ?? 0}`,
        );
      }
    } else {
      console.error(`❌ Failed to read tweet: ${result.error}`);
      process.exit(1);
    }
  });

// Replies command - list replies to a tweet
program
  .command('replies')
  .description('List replies to a tweet (by ID or URL)')
  .argument('<tweet-id-or-url>', 'Tweet ID or URL')
  .option('--json', 'Output as JSON')
  .action(async (tweetIdOrUrl: string, cmdOpts: { json?: boolean }) => {
    const opts = program.opts();
    const sweetistics = resolveSweetisticsConfig({
      sweetisticsApiKey: opts.sweetisticsApiKey || config.sweetisticsApiKey,
      sweetisticsBaseUrl: opts.sweetisticsBaseUrl || config.sweetisticsBaseUrl,
    });
    const engine = resolveEngineMode(opts.engine);
    const useSweetistics = shouldUseSweetistics(engine, Boolean(sweetistics.apiKey));
    const tweetId = extractTweetId(tweetIdOrUrl);
    if (useSweetistics) {
      if (!sweetistics.apiKey) {
        console.error('❌ Sweetistics engine selected but no API key provided.');
        process.exit(1);
      }
      const client = new SweetisticsClient({ baseUrl: sweetistics.baseUrl, apiKey: sweetistics.apiKey });
      const result = await client.replies(tweetId);
      if (result.success && result.tweets) {
        printTweets(result.tweets, { json: cmdOpts.json, emptyMessage: 'No replies found.' });
        return;
      }
      console.error(`❌ Failed to fetch replies via Sweetistics: ${result.error}`);
      process.exit(1);
    }

    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile || config.chromeProfile,
      firefoxProfile: opts.firefoxProfile || config.firefoxProfile,
    });

    for (const warning of warnings) {
      console.error(`⚠️  ${warning}`);
    }

    if (!cookies.authToken || !cookies.ct0) {
      console.error('❌ Missing required credentials');
      process.exit(1);
    }

    const client = new TwitterClient({ cookies });
    const result = await client.getReplies(tweetId);

    if (result.success && result.tweets) {
      printTweets(result.tweets, { json: cmdOpts.json, emptyMessage: 'No replies found.' });
    } else {
      console.error(`❌ Failed to fetch replies: ${result.error}`);
      process.exit(1);
    }
  });

// Thread command - show full conversation thread
program
  .command('thread')
  .description('Show the full conversation thread containing the tweet')
  .argument('<tweet-id-or-url>', 'Tweet ID or URL')
  .option('--json', 'Output as JSON')
  .action(async (tweetIdOrUrl: string, cmdOpts: { json?: boolean }) => {
    const opts = program.opts();
    const sweetistics = resolveSweetisticsConfig({
      sweetisticsApiKey: opts.sweetisticsApiKey || config.sweetisticsApiKey,
      sweetisticsBaseUrl: opts.sweetisticsBaseUrl || config.sweetisticsBaseUrl,
    });
    const engine = resolveEngineMode(opts.engine);
    const useSweetistics = shouldUseSweetistics(engine, Boolean(sweetistics.apiKey));
    const tweetId = extractTweetId(tweetIdOrUrl);
    if (useSweetistics) {
      if (!sweetistics.apiKey) {
        console.error('❌ Sweetistics engine selected but no API key provided.');
        process.exit(1);
      }
      const client = new SweetisticsClient({ baseUrl: sweetistics.baseUrl, apiKey: sweetistics.apiKey });
      const result = await client.thread(tweetId);
      if (result.success && result.tweets) {
        printTweets(result.tweets, { json: cmdOpts.json, emptyMessage: 'No thread tweets found.' });
        return;
      }
      console.error(`❌ Failed to fetch thread via Sweetistics: ${result.error}`);
      process.exit(1);
    }

    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile || config.chromeProfile,
      firefoxProfile: opts.firefoxProfile || config.firefoxProfile,
    });

    for (const warning of warnings) {
      console.error(`⚠️  ${warning}`);
    }

    if (!cookies.authToken || !cookies.ct0) {
      console.error('❌ Missing required credentials');
      process.exit(1);
    }

    const client = new TwitterClient({ cookies });
    const result = await client.getThread(tweetId);

    if (result.success && result.tweets) {
      printTweets(result.tweets, { json: cmdOpts.json, emptyMessage: 'No thread tweets found.' });
    } else {
      console.error(`❌ Failed to fetch thread: ${result.error}`);
      process.exit(1);
    }
  });

// Search command - find tweets
program
  .command('search')
  .description('Search for tweets')
  .argument('<query>', 'Search query (e.g., "@clawdbot" or "from:clawdbot")')
  .option('-n, --count <number>', 'Number of tweets to fetch', '10')
  .option('--json', 'Output as JSON')
  .action(async (query: string, cmdOpts: { count?: string; json?: boolean }) => {
    const opts = program.opts();
    const count = parseInt(cmdOpts.count || '10', 10);
    const sweetistics = resolveSweetisticsConfig({
      sweetisticsApiKey: opts.sweetisticsApiKey || config.sweetisticsApiKey,
      sweetisticsBaseUrl: opts.sweetisticsBaseUrl || config.sweetisticsBaseUrl,
    });
    const engine = resolveEngineMode(opts.engine);
    const useSweetistics = shouldUseSweetistics(engine, Boolean(sweetistics.apiKey));

    if (useSweetistics) {
      if (!sweetistics.apiKey) {
        console.error('❌ Sweetistics engine selected but no API key provided.');
        process.exit(1);
      }
      const client = new SweetisticsClient({ baseUrl: sweetistics.baseUrl, apiKey: sweetistics.apiKey });
      const result = await client.search(query, count);
      if (result.success && result.tweets) {
        printTweets(result.tweets, { json: cmdOpts.json, emptyMessage: 'No tweets found.' });
        return;
      }
      console.error(`❌ Search failed via Sweetistics: ${result.error}`);
      process.exit(1);
    }

    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile || config.chromeProfile,
      firefoxProfile: opts.firefoxProfile || config.firefoxProfile,
    });

    for (const warning of warnings) {
      console.error(`⚠️  ${warning}`);
    }

    if (!cookies.authToken || !cookies.ct0) {
      console.error('❌ Missing required credentials');
      process.exit(1);
    }

    const client = new TwitterClient({ cookies });
    const result = await client.search(query, count);

    if (result.success && result.tweets) {
      printTweets(result.tweets, { json: cmdOpts.json, emptyMessage: 'No tweets found.' });
    } else {
      console.error(`❌ Search failed: ${result.error}`);
      process.exit(1);
    }
  });

// Mentions command - shortcut to search for @username mentions
program
  .command('mentions')
  .description('Find tweets mentioning @clawdbot')
  .option('-n, --count <number>', 'Number of tweets to fetch', '10')
  .option('--json', 'Output as JSON')
  .action(async (cmdOpts: { count?: string; json?: boolean }) => {
    const opts = program.opts();
    const count = parseInt(cmdOpts.count || '10', 10);
    const sweetistics = resolveSweetisticsConfig(opts);
    const engine = resolveEngineMode(opts.engine);
    const useSweetistics = shouldUseSweetistics(engine, Boolean(sweetistics.apiKey));

    if (useSweetistics) {
      if (!sweetistics.apiKey) {
        console.error('❌ Sweetistics engine selected but no API key provided.');
        process.exit(1);
      }
      const client = new SweetisticsClient({ baseUrl: sweetistics.baseUrl, apiKey: sweetistics.apiKey });
      const result = await client.search('@clawdbot', count);
      if (result.success && result.tweets) {
        printTweets(result.tweets, { json: cmdOpts.json, emptyMessage: 'No mentions found.' });
        return;
      }
      console.error(`❌ Failed to fetch mentions via Sweetistics: ${result.error}`);
      process.exit(1);
    }

    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile,
    });

    for (const warning of warnings) {
      console.error(`⚠️  ${warning}`);
    }

    if (!cookies.authToken || !cookies.ct0) {
      console.error('❌ Missing required credentials');
      process.exit(1);
    }

    const client = new TwitterClient({ cookies });
    const result = await client.search('@clawdbot', count);

    if (result.success && result.tweets) {
      printTweets(result.tweets, { json: cmdOpts.json, emptyMessage: 'No mentions found.' });
    } else {
      console.error(`❌ Failed to fetch mentions: ${result.error}`);
      process.exit(1);
    }
  });

// Whoami command - show the logged-in account
program
  .command('whoami')
  .description('Show which Twitter account the current credentials belong to')
  .action(async () => {
    const opts = program.opts();
    const sweetistics = resolveSweetisticsConfig({
      sweetisticsApiKey: opts.sweetisticsApiKey || config.sweetisticsApiKey,
      sweetisticsBaseUrl: opts.sweetisticsBaseUrl || config.sweetisticsBaseUrl,
    });
    const engine = resolveEngineMode(opts.engine || config.engine);
    const useSweetistics = shouldUseSweetistics(engine, Boolean(sweetistics.apiKey));
    const resolvedEngine = useSweetistics ? 'sweetistics' : 'graphql';

    if (useSweetistics) {
      if (!sweetistics.apiKey) {
        console.error('❌ Sweetistics engine selected but no API key provided.');
        process.exit(1);
      }

      const client = new SweetisticsClient({ baseUrl: sweetistics.baseUrl, apiKey: sweetistics.apiKey });
      const result = await client.getCurrentUser();

      if (result.success && result.user) {
        const handle = result.user.username ? `@${result.user.username}` : '(no handle)';
        const name = result.user.name || handle;
        console.log(`🙋 Logged in via Sweetistics as ${handle} (${name})`);
        console.log(`🪪 User ID: ${result.user.id}`);
        if (result.user.email) {
          console.log(`📧 ${result.user.email}`);
        }
        console.log(`⚙️  Engine: ${resolvedEngine}`);
        return;
      }

      console.error(`❌ Failed to determine Sweetistics user: ${result.error ?? 'Unknown error'}`);
      process.exit(1);
    }

    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile || config.chromeProfile,
      firefoxProfile: opts.firefoxProfile || config.firefoxProfile,
    });

    for (const warning of warnings) {
      console.error(`⚠️  ${warning}`);
    }

    if (!cookies.authToken || !cookies.ct0) {
      console.error('❌ Missing required credentials');
      process.exit(1);
    }

    if (cookies.source) {
      console.error(`📍 Using credentials from: ${cookies.source}`);
    }

    const client = new TwitterClient({ cookies });
    const result = await client.getCurrentUser();

    if (result.success && result.user) {
      console.log(`🙋 Logged in as @${result.user.username} (${result.user.name})`);
      console.log(`🪪 User ID: ${result.user.id}`);
      console.log(`⚙️  Engine: ${resolvedEngine}`);
    } else {
      console.error(`❌ Failed to determine current user: ${result.error ?? 'Unknown error'}`);
      process.exit(1);
    }
  });

// Check command - verify credentials
program
  .command('check')
  .description('Check credential availability')
  .action(async () => {
    const opts = program.opts();
    const { cookies, warnings } = await resolveCredentials({
      authToken: opts.authToken,
      ct0: opts.ct0,
      chromeProfile: opts.chromeProfile,
    });

    console.log('🔍 Credential Check');
    console.log('─'.repeat(40));

    if (cookies.authToken) {
      console.log(`✅ auth_token: ${cookies.authToken.slice(0, 10)}...`);
    } else {
      console.log('❌ auth_token: not found');
    }

    if (cookies.ct0) {
      console.log(`✅ ct0: ${cookies.ct0.slice(0, 10)}...`);
    } else {
      console.log('❌ ct0: not found');
    }

    if (cookies.source) {
      console.log(`📍 Source: ${cookies.source}`);
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of warnings) {
        console.log(`   - ${warning}`);
      }
    }

    if (cookies.authToken && cookies.ct0) {
      console.log('\n✅ Ready to tweet!');
    } else {
      console.log('\n❌ Missing credentials. Options:');
      console.log('   1. Login to x.com in Chrome');
      console.log('   2. Set AUTH_TOKEN and CT0 environment variables');
      console.log('   3. Use --auth-token and --ct0 flags');
      process.exit(1);
    }
  });

// Show help when invoked without any subcommand
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
