#!/usr/bin/env node
/**
 * twitter-cli - CLI tool for posting tweets and replies
 *
 * Usage:
 *   twitter-cli tweet "Hello world!"
 *   twitter-cli reply <tweet-id> "This is a reply"
 *   twitter-cli reply <tweet-url> "This is a reply"
 */

import { Command } from 'commander';
import { resolveCredentials } from './lib/cookies.js';
import { TwitterClient } from './lib/twitter-client.js';

const program = new Command();

program.name('twitter-cli').description('Post tweets and replies via Twitter GraphQL API').version('0.1.0');

// Global options for authentication
program
	.option('--auth-token <token>', 'Twitter auth_token cookie')
	.option('--ct0 <token>', 'Twitter ct0 cookie')
	.option('--chrome-profile <name>', 'Chrome profile name for cookie extraction');

/**
 * Extract tweet ID from URL or return as-is if already an ID
 */
function extractTweetId(input: string): string {
	// If it's a URL, extract the tweet ID
	const urlMatch = input.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
	if (urlMatch) {
		return urlMatch[1];
	}
	// Assume it's already an ID
	return input;
}

// Tweet command
program
	.command('tweet')
	.description('Post a new tweet')
	.argument('<text>', 'Tweet text')
	.action(async (text: string) => {
		const opts = program.opts();
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

		if (cookies.source) {
			console.error(`📍 Using credentials from: ${cookies.source}`);
		}

		const tweetId = extractTweetId(tweetIdOrUrl);
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

program.parse();
