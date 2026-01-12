import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import type { TwitterClientPrivate } from './twitter-client-fixtures.js';
import { validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

const makeUserEntry = (id: string, username: string, name: string) => ({
  content: {
    itemContent: {
      user_results: {
        result: {
          __typename: 'User',
          rest_id: id,
          legacy: {
            screen_name: username,
            name,
            followers_count: 10,
            friends_count: 5,
            profile_image_url_https: 'https://img/test_normal.jpg',
          },
          is_blue_verified: false,
          core: {
            screen_name: username,
            name,
          },
        },
      },
    },
  },
});

describe('TwitterClient following pagination', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns nextCursor from the response', async () => {
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
                        makeUserEntry('1', 'alice', 'Alice'),
                        { content: { cursorType: 'Bottom', value: 'cursor-2' } },
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
    clientPrivate.getFollowingQueryIds = async () => ['q1'];
    clientPrivate.getFollowingViaRest = vi.fn();

    const result = await client.getFollowing('user-id', 3);

    expect(result.success).toBe(true);
    expect(result.users).toHaveLength(1);
    expect(result.users?.[0].username).toBe('alice');
    expect(result.nextCursor).toBe('cursor-2');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('passes cursor parameter to following API and returns nextCursor', async () => {
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
                        makeUserEntry('1', 'alice', 'Alice'),
                        { content: { cursorType: 'Bottom', value: 'cursor-2' } },
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
    clientPrivate.getFollowingQueryIds = async () => ['q1'];
    clientPrivate.getFollowingViaRest = vi.fn();

    const result = await client.getFollowing('user-id', 20, 'prev-cursor-xyz');

    expect(result.success).toBe(true);
    expect(result.nextCursor).toBe('cursor-2');

    const [url] = mockFetch.mock.calls[0];
    const parsedVars = JSON.parse(new URL(url as string).searchParams.get('variables') as string);
    expect(parsedVars.cursor).toBe('prev-cursor-xyz');
  });

  it('returns undefined nextCursor when no cursor in response', async () => {
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
                      entries: [makeUserEntry('1', 'alice', 'Alice')],
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
    clientPrivate.getFollowingQueryIds = async () => ['q1'];
    clientPrivate.getFollowingViaRest = vi.fn();

    const result = await client.getFollowing('user-id', 20);

    expect(result.success).toBe(true);
    expect(result.nextCursor).toBeUndefined();
  });

  it('returns an error for non-ok responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });

    const client = new TwitterClient({ cookies: validCookies });
    const clientPrivate = client as unknown as TwitterClientPrivate;
    clientPrivate.getFollowingQueryIds = async () => ['q1'];
    clientPrivate.getFollowingViaRest = vi.fn().mockResolvedValue({ success: false, error: 'rest fail' });

    const result = await client.getFollowing('user-id', 3);

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
    expect(result.users).toBeUndefined();
    expect(result.nextCursor).toBeUndefined();
  });
});
