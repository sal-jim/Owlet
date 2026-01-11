// ABOUTME: Tests for TwitterClient list methods.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { type TwitterClientPrivate, validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient lists owned errors', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('getOwnedLists error paths', () => {
    it('returns error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getCurrentUser = async () => ({
        success: true,
        user: { id: '12345', username: 'testuser', name: 'Test User' },
      });
      clientPrivate.getListOwnershipsQueryIds = async () => ['test'];

      const result = await client.getOwnedLists(100);

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('returns error when getCurrentUser fails', async () => {
      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getCurrentUser = async () => ({
        success: false,
        error: 'Unauthorized',
      });

      const result = await client.getOwnedLists(100);

      expect(result.success).toBe(false);
      // When getCurrentUser fails with an error, that error is used; otherwise fallback message is used
      expect(result.error).toContain('Unauthorized');
    });

    it('handles API errors in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: 'Rate limit exceeded' }],
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getCurrentUser = async () => ({
        success: true,
        user: { id: '12345', username: 'testuser', name: 'Test User' },
      });
      clientPrivate.getListOwnershipsQueryIds = async () => ['test'];

      const result = await client.getOwnedLists(100);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('returns missing feature flag errors from the API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: 'missing required feature flag: responsive_web_graphql_exclude_directive_enabled' }],
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientPrivate;
      clientPrivate.getCurrentUser = async () => ({
        success: true,
        user: { id: '12345', username: 'testuser', name: 'Test User' },
      });
      clientPrivate.getListOwnershipsQueryIds = async () => ['test'];

      const result = await client.getOwnedLists(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing required feature flag');
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
                                    id_str: '333',
                                    name: 'Retry List',
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
      clientPrivate.getListOwnershipsQueryIds = async () => ['test'];
      clientPrivate.refreshQueryIds = async () => {};

      const result = await client.getOwnedLists(100);

      expect(result.success).toBe(true);
      expect(result.lists?.[0].id).toBe('333');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('skips list entries with missing id_str or name', async () => {
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
                                  id_str: '111',
                                  name: 'Valid List',
                                },
                              },
                            },
                          },
                          {
                            content: {
                              itemContent: {
                                list: {
                                  // Missing id_str
                                  name: 'Invalid List 1',
                                },
                              },
                            },
                          },
                          {
                            content: {
                              itemContent: {
                                list: {
                                  id_str: '222',
                                  // Missing name
                                },
                              },
                            },
                          },
                          {
                            content: {
                              itemContent: {
                                list: {
                                  id_str: '333',
                                  name: 'Another Valid List',
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
      clientPrivate.getListOwnershipsQueryIds = async () => ['test'];

      const result = await client.getOwnedLists(100);

      expect(result.success).toBe(true);
      expect(result.lists).toHaveLength(2);
      expect(result.lists?.[0].id).toBe('111');
      expect(result.lists?.[1].id).toBe('333');
    });

    it('handles list with missing owner gracefully', async () => {
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
                                  id_str: '444',
                                  name: 'List Without Owner',
                                  // No user_results
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
      clientPrivate.getListOwnershipsQueryIds = async () => ['test'];

      const result = await client.getOwnedLists(100);

      expect(result.success).toBe(true);
      expect(result.lists).toHaveLength(1);
      expect(result.lists?.[0].owner).toBeUndefined();
    });
  });
});
