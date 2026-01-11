// ABOUTME: Tests for paginated list timeline fetches.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { type TwitterClientPrivate, validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient lists pagination', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('getAllListTimeline', () => {
    it('fetches multiple pages and returns all tweets', async () => {
      mockFetch
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
                                    rest_id: 'tweet1',
                                    legacy: {
                                      full_text: 'First tweet',
                                      created_at: '2024-01-01T00:00:00Z',
                                      reply_count: 0,
                                      retweet_count: 0,
                                      favorite_count: 0,
                                      conversation_id_str: 'tweet1',
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          rest_id: 'u1',
                                          legacy: { screen_name: 'user1', name: 'User 1' },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          {
                            content: {
                              cursorType: 'Bottom',
                              value: 'cursor-page-2',
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
                                    rest_id: 'tweet2',
                                    legacy: {
                                      full_text: 'Second tweet',
                                      created_at: '2024-01-02T00:00:00Z',
                                      reply_count: 0,
                                      retweet_count: 0,
                                      favorite_count: 0,
                                      conversation_id_str: 'tweet2',
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          rest_id: 'u2',
                                          legacy: { screen_name: 'user2', name: 'User 2' },
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

      const result = await client.getAllListTimeline('1234567890');

      expect(result.success).toBe(true);
      expect(result.tweets).toHaveLength(2);
      expect(result.tweets?.[0].id).toBe('tweet1');
      expect(result.tweets?.[1].id).toBe('tweet2');
      expect(result.nextCursor).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify cursor was passed in second request
      const secondCallUrl = (mockFetch.mock.calls[1] as [string])[0];
      expect(secondCallUrl).toContain('cursor-page-2');
    });

    it('stops at maxPages limit and returns nextCursor', async () => {
      mockFetch
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
                                    rest_id: 'tweet1',
                                    legacy: {
                                      full_text: 'Page 1',
                                      created_at: '2024-01-01T00:00:00Z',
                                      reply_count: 0,
                                      retweet_count: 0,
                                      favorite_count: 0,
                                      conversation_id_str: 'tweet1',
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          rest_id: 'u1',
                                          legacy: { screen_name: 'user1', name: 'User 1' },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          {
                            content: {
                              cursorType: 'Bottom',
                              value: 'cursor-page-2',
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
                                    rest_id: 'tweet2',
                                    legacy: {
                                      full_text: 'Page 2',
                                      created_at: '2024-01-02T00:00:00Z',
                                      reply_count: 0,
                                      retweet_count: 0,
                                      favorite_count: 0,
                                      conversation_id_str: 'tweet2',
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          rest_id: 'u2',
                                          legacy: { screen_name: 'user2', name: 'User 2' },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          {
                            content: {
                              cursorType: 'Bottom',
                              value: 'cursor-page-3',
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

      const result = await client.getAllListTimeline('1234567890', { maxPages: 2 });

      expect(result.success).toBe(true);
      expect(result.tweets).toHaveLength(2);
      expect(result.nextCursor).toBe('cursor-page-3');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
