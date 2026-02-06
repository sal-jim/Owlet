import { afterEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { extractArticleText } from '../src/lib/twitter-client-utils.js';

const validCookies = {
  authToken: 'test_auth_token',
  ct0: 'test_ct0_token',
  cookieHeader: 'auth_token=test_auth_token; ct0=test_ct0_token',
  source: 'test',
};

type ResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type TwitterClientUploadPrivate = TwitterClient & {
  sleep: (ms: number) => Promise<void>;
};

const makeResponse = (overrides: Partial<ResponseLike> = {}): ResponseLike => ({
  ok: true,
  status: 200,
  json: async (): Promise<unknown> => ({}),
  text: async (): Promise<string> => '',
  ...overrides,
});

describe('TwitterClient upload coverage', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OWLET_DEBUG_ARTICLE;
    vi.restoreAllMocks();
  });

  describe('uploadMedia error paths', () => {
    it('rejects unsupported media types', async () => {
      global.fetch = vi.fn() as unknown as typeof fetch;
      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.uploadMedia({ data: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf' });

      expect(result.success).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns an error when INIT fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse({ ok: false, status: 500, text: async () => 'nope' }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.uploadMedia({ data: new Uint8Array([1]), mimeType: 'image/png' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('returns an error when APPEND fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse({ json: async () => ({ media_id_string: '1' }) }))
        .mockResolvedValueOnce(makeResponse({ ok: false, status: 500, text: async () => 'nope' }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.uploadMedia({ data: new Uint8Array([1]), mimeType: 'image/png' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('returns an error when FINALIZE fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse({ json: async () => ({ media_id_string: '1' }) }))
        .mockResolvedValueOnce(makeResponse())
        .mockResolvedValueOnce(makeResponse({ ok: false, status: 500, text: async () => 'nope' }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.uploadMedia({ data: new Uint8Array([1]), mimeType: 'image/png' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('returns an error when media processing fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse({ json: async () => ({ media_id_string: '1' }) }))
        .mockResolvedValueOnce(makeResponse())
        .mockResolvedValueOnce(
          makeResponse({
            json: async () => ({ processing_info: { state: 'failed', error: { message: 'processing failed' } } }),
          }),
        );
      global.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.uploadMedia({ data: new Uint8Array([1]), mimeType: 'video/mp4' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('processing failed');
    });

    it('returns an error when STATUS fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse({ json: async () => ({ media_id_string: '1' }) }))
        .mockResolvedValueOnce(makeResponse())
        .mockResolvedValueOnce(
          makeResponse({
            json: async () => ({ processing_info: { state: 'pending', check_after_secs: 0 } }),
          }),
        )
        .mockResolvedValueOnce(makeResponse({ ok: false, status: 503, text: async () => 'down' }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientUploadPrivate;
      clientPrivate.sleep = vi.fn().mockResolvedValue(undefined);

      const result = await client.uploadMedia({ data: new Uint8Array([1]), mimeType: 'video/mp4' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 503');
    });

    it('retries STATUS and continues when processing is pending', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse({ json: async () => ({ media_id_string: '1' }) }))
        .mockResolvedValueOnce(makeResponse())
        .mockResolvedValueOnce(
          makeResponse({
            json: async () => ({ processing_info: { state: 'pending', check_after_secs: 0 } }),
          }),
        )
        .mockResolvedValueOnce(
          makeResponse({
            json: async () => ({ processing_info: { state: 'pending', check_after_secs: 0 } }),
          }),
        )
        .mockResolvedValueOnce(makeResponse({ json: async () => ({ processing_info: { state: 'succeeded' } }) }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterClient({ cookies: validCookies });
      const clientPrivate = client as unknown as TwitterClientUploadPrivate;
      clientPrivate.sleep = vi.fn().mockResolvedValue(undefined);

      const result = await client.uploadMedia({ data: new Uint8Array([1]), mimeType: 'video/mp4' });

      expect(result.success).toBe(true);
    });

    it('returns an error when metadata upload fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse({ json: async () => ({ media_id_string: '1' }) }))
        .mockResolvedValueOnce(makeResponse())
        .mockResolvedValueOnce(makeResponse({ json: async () => ({}) }))
        .mockResolvedValueOnce(makeResponse({ ok: false, status: 400, text: async () => 'bad' }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.uploadMedia({ data: new Uint8Array([1]), mimeType: 'image/png', alt: 'alt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 400');
    });

    it('returns an error when upload throws', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('boom'));
      global.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.uploadMedia({ data: new Uint8Array([1]), mimeType: 'image/png' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('boom');
    });
  });

  describe('article extraction edge cases', () => {
    it('logs article payloads when debug flag is set', () => {
      process.env.OWLET_DEBUG_ARTICLE = '1';
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = extractArticleText({
        rest_id: '1',
        article: {
          title: 'Title',
          plain_text: 'Body',
          article_results: { result: { title: 'Title', plain_text: 'Body' } },
        },
      });

      expect(result).toBe('Title\n\nBody');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('drops duplicate body when it matches the title', () => {
      const result = extractArticleText({
        rest_id: '1',
        article: {
          title: 'Same',
          plain_text: 'Same',
          article_results: { result: { title: 'Same', plain_text: 'Same' } },
        },
      });

      expect(result).toBe('Same');
    });
  });
});
