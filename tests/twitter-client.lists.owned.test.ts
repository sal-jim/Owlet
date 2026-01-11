// ABOUTME: Tests for TwitterClient list methods.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { type TwitterClientPrivate, validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient lists owned', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  describe('getOwnedLists', () => {
    it('fetches owned lists and parses list results', async () => {
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
                                  id_str: '1234567890',
                                  name: 'My Test List',
                                  description: 'A test list for testing',
                                  member_count: 10,
                                  subscriber_count: 5,
                                  mode: 'Public',
                                  created_at: '2024-01-01T00:00:00Z',
                                  user_results: {
                                    result: {
                                      rest_id: '12345',
                                      legacy: { screen_name: 'testuser', name: 'Test User' },
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
      clientPrivate.getListOwnershipsQueryIds = async () => ['test'];

      const result = await client.getOwnedLists(100);

      expect(result.success).toBe(true);
      expect(result.lists).toHaveLength(1);
      expect(result.lists?.[0].id).toBe('1234567890');
      expect(result.lists?.[0].name).toBe('My Test List');
      expect(result.lists?.[0].description).toBe('A test list for testing');
      expect(result.lists?.[0].memberCount).toBe(10);
      expect(result.lists?.[0].subscriberCount).toBe(5);
      expect(result.lists?.[0].isPrivate).toBe(false);
      expect(result.lists?.[0].owner?.username).toBe('testuser');
    });

    it('includes required feature flags in list requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              result: {
                timeline: {
                  timeline: {
                    instructions: [],
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

      await client.getOwnedLists(1);

      const [url] = mockFetch.mock.calls[0];
      const parsedFeatures = JSON.parse(new URL(url as string).searchParams.get('features') as string);
      expect(parsedFeatures.responsive_web_graphql_exclude_directive_enabled).toBe(true);
      expect(parsedFeatures.blue_business_profile_image_shape_enabled).toBe(false);
      expect(parsedFeatures.responsive_web_text_conversations_enabled).toBe(false);
      expect(parsedFeatures.tweetypie_unmention_optimization_enabled).toBe(true);
      expect(parsedFeatures.vibe_api_enabled).toBe(false);
      expect(parsedFeatures.interactive_text_enabled).toBe(false);
    });

    it('handles private lists correctly', async () => {
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
                                  id_str: '9999',
                                  name: 'Secret List',
                                  mode: 'Private',
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
      expect(result.lists?.[0].isPrivate).toBe(true);
    });

    it('handles lowercase private mode', async () => {
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
                                  id_str: '8888',
                                  name: 'Lowercase Private',
                                  mode: 'private',
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
      expect(result.lists?.[0].isPrivate).toBe(true);
    });

    it('handles missing mode', async () => {
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
                                  id_str: '9999',
                                  name: 'No Mode',
                                  mode: null,
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
      expect(result.lists?.[0].isPrivate).toBe(false);
    });

    it('returns empty array when no lists exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              result: {
                timeline: {
                  timeline: {
                    instructions: [],
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
      expect(result.lists).toEqual([]);
    });
  });
});
