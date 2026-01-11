// ABOUTME: Tests for paginated list timeline fetches.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { type TwitterClientPrivate, validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient lists pagination (continued)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('resumes from cursor', async () => {
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
                                rest_id: 'tweet-resumed',
                                legacy: {
                                  full_text: 'Resumed tweet',
                                  created_at: '2024-01-01T00:00:00Z',
                                  reply_count: 0,
                                  retweet_count: 0,
                                  favorite_count: 0,
                                  conversation_id_str: 'tweet-resumed',
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

    const result = await client.getAllListTimeline('1234567890', { cursor: 'resume-cursor' });

    expect(result.success).toBe(true);
    expect(result.tweets).toHaveLength(1);
    expect(result.tweets?.[0].id).toBe('tweet-resumed');

    // Verify cursor was passed in the request
    const callUrl = (mockFetch.mock.calls[0] as [string])[0];
    expect(callUrl).toContain('resume-cursor');
  });

  it('deduplicates tweets across pages', async () => {
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
                                  rest_id: 'duplicate-tweet',
                                  legacy: {
                                    full_text: 'Duplicate',
                                    created_at: '2024-01-01T00:00:00Z',
                                    reply_count: 0,
                                    retweet_count: 0,
                                    favorite_count: 0,
                                    conversation_id_str: 'duplicate-tweet',
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
                                  rest_id: 'duplicate-tweet',
                                  legacy: {
                                    full_text: 'Duplicate',
                                    created_at: '2024-01-01T00:00:00Z',
                                    reply_count: 0,
                                    retweet_count: 0,
                                    favorite_count: 0,
                                    conversation_id_str: 'duplicate-tweet',
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
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: 'unique-tweet',
                                  legacy: {
                                    full_text: 'Unique',
                                    created_at: '2024-01-02T00:00:00Z',
                                    reply_count: 0,
                                    retweet_count: 0,
                                    favorite_count: 0,
                                    conversation_id_str: 'unique-tweet',
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
    expect(result.tweets?.[0].id).toBe('duplicate-tweet');
    expect(result.tweets?.[1].id).toBe('unique-tweet');
  });

  it('stops when a page only returns duplicates', async () => {
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
                                  rest_id: 'dup',
                                  legacy: {
                                    full_text: 'Duplicate',
                                    created_at: '2024-01-01T00:00:00Z',
                                    reply_count: 0,
                                    retweet_count: 0,
                                    favorite_count: 0,
                                    conversation_id_str: 'dup',
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
                                  rest_id: 'dup',
                                  legacy: {
                                    full_text: 'Duplicate',
                                    created_at: '2024-01-02T00:00:00Z',
                                    reply_count: 0,
                                    retweet_count: 0,
                                    favorite_count: 0,
                                    conversation_id_str: 'dup',
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

    const result = await client.getAllListTimeline('1234567890');

    expect(result.success).toBe(true);
    expect(result.tweets).toHaveLength(1);
    expect(result.nextCursor).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops when no cursor is returned', async () => {
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
                                    full_text: 'Last page',
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
    expect(result.nextCursor).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
