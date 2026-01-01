import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SweetCookieResult = { cookies: Array<{ name: string; value: string; domain?: string }>; warnings: string[] };

const sweet = vi.hoisted(() => ({
  results: new Map<string, SweetCookieResult>(),
  options: new Map<string, { timeoutMs?: number }>(),
}));

vi.mock('@steipete/sweet-cookie', () => ({
  getCookies: vi.fn(async (options: { browsers?: string[]; timeoutMs?: number }) => {
    const browser = options.browsers?.[0] ?? 'unknown';
    sweet.options.set(browser, options);
    return (
      sweet.results.get(browser) ?? {
        cookies: [],
        warnings: [],
      }
    );
  }),
}));

describe('cookies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    sweet.results.clear();
    sweet.options.clear();
    process.env = { ...originalEnv };
    process.env.AUTH_TOKEN = undefined;
    process.env.TWITTER_AUTH_TOKEN = undefined;
    process.env.CT0 = undefined;
    process.env.TWITTER_CT0 = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('resolveCredentials', () => {
    it('honors cookieSource=firefox even when Safari has cookies', async () => {
      sweet.results.set('safari', {
        cookies: [
          { name: 'auth_token', value: 'safari_auth', domain: 'x.com' },
          { name: 'ct0', value: 'safari_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });
      sweet.results.set('firefox', {
        cookies: [
          { name: 'auth_token', value: 'firefox_auth', domain: 'x.com' },
          { name: 'ct0', value: 'firefox_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'firefox' });

      expect(result.cookies.authToken).toBe('firefox_auth');
      expect(result.cookies.ct0).toBe('firefox_ct0');
      expect(result.cookies.source).toContain('Firefox');
    });

    it('honors cookieSource=safari', async () => {
      if (process.platform !== 'darwin') {
        return;
      }
      sweet.results.set('safari', {
        cookies: [
          { name: 'auth_token', value: 'safari_auth', domain: 'x.com' },
          { name: 'ct0', value: 'safari_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'safari' });

      expect(result.cookies.authToken).toBe('safari_auth');
      expect(result.cookies.ct0).toBe('safari_ct0');
      expect(result.cookies.cookieHeader).toContain('auth_token=safari_auth');
      expect(result.cookies.cookieHeader).toContain('ct0=safari_ct0');
      expect(result.cookies.source).toBe('Safari');
    });

    it('uses firefox when enabled and returns cookies', async () => {
      sweet.results.set('firefox', {
        cookies: [
          { name: 'auth_token', value: 'firefox_auth', domain: 'x.com' },
          { name: 'ct0', value: 'firefox_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'firefox', firefoxProfile: 'abc.default-release' });

      expect(result.cookies.authToken).toBe('firefox_auth');
      expect(result.cookies.ct0).toBe('firefox_ct0');
      expect(result.cookies.cookieHeader).toContain('auth_token=firefox_auth');
      expect(result.cookies.cookieHeader).toContain('ct0=firefox_ct0');
      expect(result.cookies.source).toContain('Firefox');
    });

    it('should prioritize CLI arguments over env vars', async () => {
      process.env.AUTH_TOKEN = 'env_auth';
      process.env.CT0 = 'env_ct0';

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({
        authToken: 'cli_auth',
        ct0: 'cli_ct0',
      });

      expect(result.cookies.authToken).toBe('cli_auth');
      expect(result.cookies.ct0).toBe('cli_ct0');
      expect(result.cookies.cookieHeader).toBe('auth_token=cli_auth; ct0=cli_ct0');
      expect(result.cookies.source).toBe('CLI argument');
    });

    it('should use AUTH_TOKEN env var', async () => {
      process.env.AUTH_TOKEN = 'test_auth_token';
      process.env.CT0 = 'test_ct0';

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'safari' });

      expect(result.cookies.authToken).toBe('test_auth_token');
      expect(result.cookies.ct0).toBe('test_ct0');
      expect(result.cookies.source).toBe('env AUTH_TOKEN');
    });

    it('should use TWITTER_AUTH_TOKEN env var as fallback', async () => {
      process.env.TWITTER_AUTH_TOKEN = 'twitter_auth';
      process.env.TWITTER_CT0 = 'twitter_ct0';

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'safari' });

      expect(result.cookies.authToken).toBe('twitter_auth');
      expect(result.cookies.ct0).toBe('twitter_ct0');
    });

    it('should trim whitespace from values', async () => {
      process.env.AUTH_TOKEN = '  trimmed_auth  ';
      process.env.CT0 = '  trimmed_ct0  ';

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({});

      expect(result.cookies.authToken).toBe('trimmed_auth');
      expect(result.cookies.ct0).toBe('trimmed_ct0');
    });

    it('should treat empty strings as null', async () => {
      process.env.AUTH_TOKEN = '   ';
      process.env.CT0 = '';

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'safari' });

      expect(result.cookies.authToken).toBeNull();
      expect(result.cookies.ct0).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn when credentials are missing', async () => {
      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'safari' });

      expect(result.warnings).toContain(
        'Missing auth_token - provide via --auth-token, AUTH_TOKEN env var, or login to x.com in Safari/Chrome/Firefox',
      );
      expect(result.warnings).toContain(
        'Missing ct0 - provide via --ct0, CT0 env var, or login to x.com in Safari/Chrome/Firefox',
      );
    });

    it('falls back to Chrome when enabled and Firefox disabled', async () => {
      sweet.results.set('chrome', {
        cookies: [
          { name: 'auth_token', value: 'test_auth', domain: 'x.com' },
          { name: 'ct0', value: 'test_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({
        cookieSource: 'chrome',
        chromeProfile: 'Default',
        cookieTimeoutMs: 15000,
      });

      expect(result.cookies.authToken).toBe('test_auth');
      expect(result.cookies.ct0).toBe('test_ct0');
      expect(result.cookies.source).toContain('Chrome');
      expect(sweet.options.get('chrome')?.timeoutMs).toBe(15000);
    });

    it('defaults to a 30s cookie timeout on macOS', async () => {
      if (process.platform !== 'darwin') {
        return;
      }
      sweet.results.set('chrome', {
        cookies: [
          { name: 'auth_token', value: 'test_auth', domain: 'x.com' },
          { name: 'ct0', value: 'test_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'chrome' });

      expect(result.cookies.authToken).toBe('test_auth');
      expect(result.cookies.ct0).toBe('test_ct0');
      expect(sweet.options.get('chrome')?.timeoutMs).toBe(30000);
    });

    it('uses default browser order when cookieSource is omitted', async () => {
      sweet.results.set('safari', { cookies: [], warnings: [] });
      sweet.results.set('chrome', { cookies: [], warnings: [] });
      sweet.results.set('firefox', {
        cookies: [
          { name: 'auth_token', value: 'firefox_auth', domain: 'x.com' },
          { name: 'ct0', value: 'firefox_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({});

      expect(result.cookies.authToken).toBe('firefox_auth');
      expect(result.cookies.ct0).toBe('firefox_ct0');
      expect(result.cookies.source).toContain('Firefox');
    });

    it('prefers twitter.com cookies when x.com is missing', async () => {
      sweet.results.set('chrome', {
        cookies: [
          { name: 'auth_token', value: 'twitter_auth', domain: 'twitter.com' },
          { name: 'ct0', value: 'twitter_ct0', domain: 'twitter.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'chrome' });

      expect(result.cookies.authToken).toBe('twitter_auth');
      expect(result.cookies.ct0).toBe('twitter_ct0');
    });

    it('falls back to the first cookie when no domain matches', async () => {
      sweet.results.set('firefox', {
        cookies: [
          { name: 'auth_token', value: 'first_auth', domain: 'example.com' },
          { name: 'ct0', value: 'first_ct0', domain: 'example.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: 'firefox' });

      expect(result.cookies.authToken).toBe('first_auth');
      expect(result.cookies.ct0).toBe('first_ct0');
    });
  });

  describe('extractCookiesFromSafari', () => {
    it('returns cookies from Safari', async () => {
      if (process.platform !== 'darwin') {
        return;
      }
      sweet.results.set('safari', {
        cookies: [
          { name: 'auth_token', value: 'safari_auth', domain: 'x.com' },
          { name: 'ct0', value: 'safari_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { extractCookiesFromSafari } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromSafari();

      expect(result.cookies.authToken).toBe('safari_auth');
      expect(result.cookies.ct0).toBe('safari_ct0');
      expect(result.cookies.source).toBe('Safari');
    });

    it('prefers Safari over Chrome when both are available', async () => {
      if (process.platform !== 'darwin') {
        return;
      }
      sweet.results.set('safari', {
        cookies: [
          { name: 'auth_token', value: 'safari_auth', domain: 'x.com' },
          { name: 'ct0', value: 'safari_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });
      sweet.results.set('chrome', {
        cookies: [
          { name: 'auth_token', value: 'chrome_auth', domain: 'x.com' },
          { name: 'ct0', value: 'chrome_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { resolveCredentials } = await import('../src/lib/cookies.js');
      const result = await resolveCredentials({ cookieSource: ['safari', 'chrome'] });

      expect(result.cookies.authToken).toBe('safari_auth');
      expect(result.cookies.ct0).toBe('safari_ct0');
    });
  });

  describe('extractCookiesFromChrome', () => {
    it('returns cookies when Chrome yields values', async () => {
      sweet.results.set('chrome', {
        cookies: [
          { name: 'auth_token', value: 'test_auth', domain: 'x.com' },
          { name: 'ct0', value: 'test_ct0', domain: 'x.com' },
        ],
        warnings: [],
      });

      const { extractCookiesFromChrome } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromChrome('Default');

      expect(result.cookies.authToken).toBe('test_auth');
      expect(result.cookies.ct0).toBe('test_ct0');
      expect(result.cookies.source).toContain('Chrome');
      expect(result.warnings).toHaveLength(0);
    });

    it('warns when Chrome returns no cookies', async () => {
      sweet.results.set('chrome', { cookies: [], warnings: [] });

      const { extractCookiesFromChrome } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromChrome('Default');

      expect(result.cookies.authToken).toBeNull();
      expect(result.cookies.ct0).toBeNull();
      expect(result.warnings.some((w) => w.includes('No Twitter cookies found in Chrome'))).toBe(true);
    });
  });

  describe('extractCookiesFromFirefox', () => {
    it('warns when Firefox cookies database is missing', async () => {
      sweet.results.set('firefox', {
        cookies: [],
        warnings: ['Firefox cookies database not found.'],
      });

      const { extractCookiesFromFirefox } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromFirefox('missing-profile');

      expect(result.cookies.authToken).toBeNull();
      expect(result.cookies.ct0).toBeNull();
      expect(result.warnings).toContain('Firefox cookies database not found.');
    });

    it('warns when Firefox returns no cookies', async () => {
      sweet.results.set('firefox', { cookies: [], warnings: [] });

      const { extractCookiesFromFirefox } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromFirefox('abc.default-release');

      expect(result.cookies.authToken).toBeNull();
      expect(result.cookies.ct0).toBeNull();
      expect(result.warnings.some((w) => w.includes('No Twitter cookies found in Firefox'))).toBe(true);
    });
  });
});
