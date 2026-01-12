import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { type TwitterClientPrivate, validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});
describe('TwitterClient likes', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('fetches likes and parses tweet results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          user: {
            result: {
              timeline: {
                timeline: {
                  instructions: [
                    {
                      entries: [
                        {
                          content: {
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: '2',
                                  legacy: {
                                    full_text: 'liked',
                                    created_at: '2024-01-01T00:00:00Z',
                                    reply_count: 0,
                                    retweet_count: 0,
                                    favorite_count: 0,
                                    conversation_id_str: '2',
                                  },
                                  core: {
                                    user_results: {
                                      result: {
                                        rest_id: 'u2',
                                        legacy: { screen_name: 'root', name: 'Root' },
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
        },
      }),
    });

    const client = new TwitterClient({ cookies: validCookies });
    const clientPrivate = client as unknown as TwitterClientPrivate;
    clientPrivate.getCurrentUser = async () => ({
      success: true,
      user: { id: '42', username: 'tester', name: 'Tester' },
    });
    clientPrivate.getLikesQueryIds = async () => ['test'];

    const result = await client.getLikes(2);

    expect(result.success).toBe(true);
    expect(result.tweets?.[0].id).toBe('2');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('GET');
    expect(String(url)).toContain('/Likes?');
    const parsedVars = JSON.parse(new URL(url as string).searchParams.get('variables') as string);
    expect(parsedVars.userId).toBe('42');
    expect(parsedVars.count).toBe(2);
    const parsedFeatures = JSON.parse(new URL(url as string).searchParams.get('features') as string);
    expect(parsedFeatures.graphql_timeline_v2_bookmark_timeline).toBeUndefined();
  });

  it('paginates likes when count exceeds the first page', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              result: {
                timeline: {
                  timeline: {
                    instructions: [
                      {
                        entries: [
                          {
                            content: {
                              itemContent: {
                                tweet_results: {
                                  result: {
                                    rest_id: '1',
                                    legacy: {
                                      full_text: 'liked page 1',
                                      created_at: '2024-01-01T00:00:00Z',
                                      reply_count: 0,
                                      retweet_count: 0,
                                      favorite_count: 0,
                                      conversation_id_str: '1',
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          rest_id: 'u1',
                                          legacy: { screen_name: 'root', name: 'Root' },
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
                              value: 'cursor-1',
                            },
                          },
                        ],
                      },
                    ],
                  },
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
            user: {
              result: {
                timeline: {
                  timeline: {
                    instructions: [
                      {
                        entries: [
                          {
                            content: {
                              itemContent: {
                                tweet_results: {
                                  result: {
                                    rest_id: '2',
                                    legacy: {
                                      full_text: 'liked page 2',
                                      created_at: '2024-01-02T00:00:00Z',
                                      reply_count: 0,
                                      retweet_count: 0,
                                      favorite_count: 0,
                                      conversation_id_str: '2',
                                    },
                                    core: {
                                      user_results: {
                                        result: {
                                          rest_id: 'u2',
                                          legacy: { screen_name: 'root', name: 'Root' },
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
          },
        }),
      });

    const client = new TwitterClient({ cookies: validCookies });
    const clientPrivate = client as unknown as TwitterClientPrivate;
    clientPrivate.getCurrentUser = async () => ({
      success: true,
      user: { id: '42', username: 'tester', name: 'Tester' },
    });
    clientPrivate.getLikesQueryIds = async () => ['test'];

    const result = await client.getLikes(3);

    expect(result.success).toBe(true);
    expect(result.tweets?.map((tweet) => tweet.id)).toEqual(['1', '2']);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const secondVars = JSON.parse(
      new URL(mockFetch.mock.calls[1][0] as string).searchParams.get('variables') as string,
    );
    expect(secondVars.cursor).toBe('cursor-1');
  });

  it('returns an error when current user is unavailable', async () => {
    const client = new TwitterClient({ cookies: validCookies });
    const clientPrivate = client as unknown as TwitterClientPrivate;
    clientPrivate.getCurrentUser = async () => ({ success: false, error: 'no user' });

    const result = await client.getLikes(1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('no user');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
