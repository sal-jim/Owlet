/**
 * Twitter GraphQL API client for posting tweets and replies
 */

import type { TwitterCookies } from './cookies.js';

const TWITTER_API_BASE = 'https://x.com/i/api/graphql';

// Twitter GraphQL query IDs - these may need to be updated periodically
// as Twitter rotates them. Check browser network tab for current values.
const QUERY_IDS = {
	CreateTweet: 'znCVAd692dKBq9MgkEhKPQ',
	CreateRetweet: 'ojPdsZsimiJrUGLR1sjUtA',
	FavoriteTweet: 'lI07N6Otwv1PhnEgXILM7A',
};

export interface TweetResult {
	success: boolean;
	tweetId?: string;
	error?: string;
}

export interface TwitterClientOptions {
	cookies: TwitterCookies;
	userAgent?: string;
}

interface CreateTweetResponse {
	data?: {
		create_tweet?: {
			tweet_results?: {
				result?: {
					rest_id?: string;
					legacy?: {
						full_text?: string;
					};
				};
			};
		};
	};
	errors?: Array<{ message: string; code?: number }>;
}

export class TwitterClient {
	private authToken: string;
	private ct0: string;
	private userAgent: string;

	constructor(options: TwitterClientOptions) {
		if (!options.cookies.authToken || !options.cookies.ct0) {
			throw new Error('Both authToken and ct0 cookies are required');
		}
		this.authToken = options.cookies.authToken;
		this.ct0 = options.cookies.ct0;
		this.userAgent =
			options.userAgent ||
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
	}

	private getHeaders(): Record<string, string> {
		return {
			authorization:
				'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
			'content-type': 'application/json',
			'x-csrf-token': this.ct0,
			'x-twitter-auth-type': 'OAuth2Session',
			'x-twitter-active-user': 'yes',
			'x-twitter-client-language': 'en',
			cookie: `auth_token=${this.authToken}; ct0=${this.ct0}`,
			'user-agent': this.userAgent,
			origin: 'https://x.com',
			referer: 'https://x.com/',
		};
	}

	/**
	 * Post a new tweet
	 */
	async tweet(text: string): Promise<TweetResult> {
		const variables = {
			tweet_text: text,
			dark_request: false,
			media: {
				media_entities: [],
				possibly_sensitive: false,
			},
			semantic_annotation_ids: [],
		};

		const features = {
			communities_web_enable_tweet_community_results_fetch: true,
			c9s_tweet_anatomy_moderator_badge_enabled: true,
			responsive_web_edit_tweet_api_enabled: true,
			graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
			view_counts_everywhere_api_enabled: true,
			longform_notetweets_consumption_enabled: true,
			responsive_web_twitter_article_tweet_consumption_enabled: true,
			tweet_awards_web_tipping_enabled: false,
			creator_subscriptions_quote_tweet_preview_enabled: false,
			longform_notetweets_rich_text_read_enabled: true,
			longform_notetweets_inline_media_enabled: true,
			articles_preview_enabled: true,
			rweb_video_timestamps_enabled: true,
			rweb_tipjar_consumption_enabled: true,
			responsive_web_graphql_exclude_directive_enabled: true,
			verified_phone_label_enabled: false,
			freedom_of_speech_not_reach_fetch_enabled: true,
			standardized_nudges_misinfo: true,
			tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
			responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
			responsive_web_graphql_timeline_navigation_enabled: true,
			responsive_web_enhance_cards_enabled: false,
		};

		return this.createTweet(variables, features);
	}

	/**
	 * Reply to an existing tweet
	 */
	async reply(text: string, replyToTweetId: string): Promise<TweetResult> {
		const variables = {
			tweet_text: text,
			reply: {
				in_reply_to_tweet_id: replyToTweetId,
				exclude_reply_user_ids: [],
			},
			dark_request: false,
			media: {
				media_entities: [],
				possibly_sensitive: false,
			},
			semantic_annotation_ids: [],
		};

		const features = {
			communities_web_enable_tweet_community_results_fetch: true,
			c9s_tweet_anatomy_moderator_badge_enabled: true,
			responsive_web_edit_tweet_api_enabled: true,
			graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
			view_counts_everywhere_api_enabled: true,
			longform_notetweets_consumption_enabled: true,
			responsive_web_twitter_article_tweet_consumption_enabled: true,
			tweet_awards_web_tipping_enabled: false,
			creator_subscriptions_quote_tweet_preview_enabled: false,
			longform_notetweets_rich_text_read_enabled: true,
			longform_notetweets_inline_media_enabled: true,
			articles_preview_enabled: true,
			rweb_video_timestamps_enabled: true,
			rweb_tipjar_consumption_enabled: true,
			responsive_web_graphql_exclude_directive_enabled: true,
			verified_phone_label_enabled: false,
			freedom_of_speech_not_reach_fetch_enabled: true,
			standardized_nudges_misinfo: true,
			tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
			responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
			responsive_web_graphql_timeline_navigation_enabled: true,
			responsive_web_enhance_cards_enabled: false,
		};

		return this.createTweet(variables, features);
	}

	private async createTweet(
		variables: Record<string, unknown>,
		features: Record<string, boolean>,
	): Promise<TweetResult> {
		const url = `${TWITTER_API_BASE}/${QUERY_IDS.CreateTweet}/CreateTweet`;

		const body = JSON.stringify({
			variables,
			features,
			queryId: QUERY_IDS.CreateTweet,
		});

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: this.getHeaders(),
				body,
			});

			if (!response.ok) {
				const text = await response.text();
				return {
					success: false,
					error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
				};
			}

			const data = (await response.json()) as CreateTweetResponse;

			if (data.errors && data.errors.length > 0) {
				return {
					success: false,
					error: data.errors.map((e) => e.message).join(', '),
				};
			}

			const tweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
			if (tweetId) {
				return {
					success: true,
					tweetId,
				};
			}

			return {
				success: false,
				error: 'Tweet created but no ID returned',
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
