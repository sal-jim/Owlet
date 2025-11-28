import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process.execSync to prevent actual shell commands
vi.mock('node:child_process', () => ({
	execSync: vi.fn(() => ''),
}));

// Mock fs to prevent actual file operations
vi.mock('node:fs', () => ({
	existsSync: vi.fn(() => false),
	copyFileSync: vi.fn(),
	mkdtempSync: vi.fn(() => '/tmp/test-dir'),
	rmSync: vi.fn(),
}));

describe('cookies', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		// Clear Twitter-related env vars
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
			expect(result.cookies.source).toBe('CLI argument');
		});

		it('should use AUTH_TOKEN env var', async () => {
			process.env.AUTH_TOKEN = 'test_auth_token';
			process.env.CT0 = 'test_ct0';

			const { resolveCredentials } = await import('../src/lib/cookies.js');
			const result = await resolveCredentials({});

			expect(result.cookies.authToken).toBe('test_auth_token');
			expect(result.cookies.ct0).toBe('test_ct0');
			expect(result.cookies.source).toBe('env AUTH_TOKEN');
		});

		it('should use TWITTER_AUTH_TOKEN env var as fallback', async () => {
			process.env.TWITTER_AUTH_TOKEN = 'twitter_auth';
			process.env.TWITTER_CT0 = 'twitter_ct0';

			const { resolveCredentials } = await import('../src/lib/cookies.js');
			const result = await resolveCredentials({});

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
			const result = await resolveCredentials({});

			expect(result.cookies.authToken).toBeNull();
			expect(result.cookies.ct0).toBeNull();
			expect(result.warnings.length).toBeGreaterThan(0);
		});

		it('should warn when credentials are missing', async () => {
			const { resolveCredentials } = await import('../src/lib/cookies.js');
			const result = await resolveCredentials({});

			expect(result.warnings).toContain(
				'Missing auth_token - provide via --auth-token, AUTH_TOKEN env var, or login to x.com in Chrome',
			);
			expect(result.warnings).toContain('Missing ct0 - provide via --ct0, CT0 env var, or login to x.com in Chrome');
		});
	});
});
