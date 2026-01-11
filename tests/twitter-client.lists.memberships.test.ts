// ABOUTME: Tests for TwitterClient list methods.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { type TwitterClientPrivate, validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient lists memberships', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('getListMemberships', () => {
    it('fetches list memberships and parses list results', async () => {
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
                                list: {
                                  id_str: '5555',
                                  name: 'Member List',
                                  member_count: 100,
                                  user_results: {
                                    result: {
                                      rest_id: '99999',
                                      legacy: { screen_name: 'otheruser', name: 'Other User' },
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
        user: { id: '12345', username: 'testuser', name: 'Test User' },
      });
      clientPrivate.getListMembershipsQueryIds = async () => ['test'];

      const result = await client.getListMemberships(100);

      expect(result.success).toBe(true);
      expect(result.lists?.[0].id).toBe('5555');
      expect(result.lists?.[0].name).toBe('Member List');
      expect(result.lists?.[0].owner?.username).toBe('otheruser');
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
                                  list: {
                                    id_str: '6666',
                                    name: 'Retry Membership List',
                                    mode: 'Public',
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
        user: { id: '12345', username: 'testuser', name: 'Test User' },
      });
      clientPrivate.getListMembershipsQueryIds = async () => ['test'];
      clientPrivate.refreshQueryIds = async () => {};

      const result = await client.getListMemberships(100);

      expect(result.success).toBe(true);
      expect(result.lists?.[0].id).toBe('6666');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
