import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';

describe('TwitterClient', () => {
	const validCookies = {
		authToken: 'test_auth_token',
		ct0: 'test_ct0_token',
		source: 'test',
	};

	describe('constructor', () => {
		it('should throw if authToken is missing', () => {
			expect(
				() =>
					new TwitterClient({
						cookies: { authToken: null, ct0: 'test', source: null },
					}),
			).toThrow('Both authToken and ct0 cookies are required');
		});

		it('should throw if ct0 is missing', () => {
			expect(
				() =>
					new TwitterClient({
						cookies: { authToken: 'test', ct0: null, source: null },
					}),
			).toThrow('Both authToken and ct0 cookies are required');
		});

		it('should create client with valid cookies', () => {
			const client = new TwitterClient({ cookies: validCookies });
			expect(client).toBeInstanceOf(TwitterClient);
		});
	});

	describe('tweet', () => {
		let mockFetch: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			mockFetch = vi.fn();
			global.fetch = mockFetch;
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should post a tweet successfully', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						create_tweet: {
							tweet_results: {
								result: {
									rest_id: '1234567890',
									legacy: {
										full_text: 'Hello world!',
									},
								},
							},
						},
					},
				}),
			});

			const client = new TwitterClient({ cookies: validCookies });
			const result = await client.tweet('Hello world!');

			expect(result.success).toBe(true);
			expect(result.tweetId).toBe('1234567890');
			expect(mockFetch).toHaveBeenCalledTimes(1);

			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toContain('CreateTweet');
			expect(options.method).toBe('POST');

			const body = JSON.parse(options.body);
			expect(body.variables.tweet_text).toBe('Hello world!');
		});

		it('should handle API errors', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					errors: [{ message: 'Rate limit exceeded', code: 88 }],
				}),
			});

			const client = new TwitterClient({ cookies: validCookies });
			const result = await client.tweet('Test');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Rate limit exceeded');
		});

		it('should handle HTTP errors', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				text: async () => 'Forbidden',
			});

			const client = new TwitterClient({ cookies: validCookies });
			const result = await client.tweet('Test');

			expect(result.success).toBe(false);
			expect(result.error).toContain('HTTP 403');
		});

		it('should handle network errors', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const client = new TwitterClient({ cookies: validCookies });
			const result = await client.tweet('Test');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Network error');
		});
	});

	describe('reply', () => {
		let mockFetch: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			mockFetch = vi.fn();
			global.fetch = mockFetch;
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should post a reply with correct reply_to_tweet_id', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						create_tweet: {
							tweet_results: {
								result: {
									rest_id: '9876543210',
								},
							},
						},
					},
				}),
			});

			const client = new TwitterClient({ cookies: validCookies });
			const result = await client.reply('This is a reply', '1234567890');

			expect(result.success).toBe(true);
			expect(result.tweetId).toBe('9876543210');

			const [, options] = mockFetch.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.variables.reply.in_reply_to_tweet_id).toBe('1234567890');
			expect(body.variables.tweet_text).toBe('This is a reply');
		});
	});
});
