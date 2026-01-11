// ABOUTME: Tests for TwitterClient list methods.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { type TwitterClientPrivate, validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient lists timeline', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('getListTimeline', () => {
    it('fetches list timeline and parses tweet results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            list: {
              tweets_timeline: {
                timeline: {
                  instructions: [
                    {
                      entries: [
                        {
                          content: {
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: '111',
                                  legacy: {
                                    full_text: 'Tweet from list',
                                    created_at: '2024-01-01T00:00:00Z',
                                    reply_count: 0,
                                    retweet_count: 0,
                                    favorite_count: 0,
                                    conversation_id_str: '111',
                                  },
                                  core: {
                                    user_results: {
                                      result: {
                                        rest_id: 'u1',
                                        legacy: { screen_name: 'listmember', name: 'List Member' },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getListTimelineQueryIds = async () => ['test'];

      const result = await client.getListTimeline('1234567890', 20);

      expect(result.success).toBe(true);
      expect(result.tweets?.[0].id).toBe('111');
      expect(result.tweets?.[0].text).toBe('Tweet from list');
      expect(result.tweets?.[0].author.username).toBe('listmember');
    });

    it('returns empty array when list has no tweets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            list: {
              tweets_timeline: {
                timeline: {
                  instructions: [],
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getListTimelineQueryIds = async () => ['test'];

      const result = await client.getListTimeline('1234567890', 20);

      expect(result.success).toBe(true);
      expect(result.tweets).toEqual([]);
    });

    it('returns error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getListTimelineQueryIds = async () => ['test'];

      const result = await client.getListTimeline('1234567890', 20);

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 403');
    });

    it('handles API errors in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: 'List not found' }],
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getListTimelineQueryIds = async () => ['test'];

      const result = await client.getListTimeline('nonexistent', 20);

      expect(result.success).toBe(false);
      expect(result.error).toContain('List not found');
    });

    it('retries on 404 error after refreshing query IDs', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => 'Not Found',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              list: {
                tweets_timeline: {
                  timeline: {
                    instructions: [
                      {
                        entries: [
                          {
                            content: {
                              itemContent: {
                                tweet_results: {
                                  result: {
                                    rest_id: '222',
                                    legacy: {
                                      full_text: 'Retry success',
                                      created_at: '2024-01-01T00:00:00Z',
                                      reply_count: 0,
                                      retweet_count: 0,
                                      favorite_count: 0,
                                      conversation_id_str: '222',
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          rest_id: 'u2',
                                          legacy: { screen_name: 'user2', name: 'User Two' },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          }),
        });

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getListTimelineQueryIds = async () => ['test'];
      clientPrivate.refreshQueryIds = async () => {};

      const result = await client.getListTimeline('1234567890', 20);

      expect(result.success).toBe(true);
      expect(result.tweets?.[0].id).toBe('222');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
