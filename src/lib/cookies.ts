/**
 * Chrome cookie extraction for Twitter authentication
 * Uses macOS sqlite3 CLI and keychain for decryption - no native dependencies!
 */

import { execSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TwitterCookies {
	authToken: string | null;
	ct0: string | null;
	source: string | null;
}

export interface CookieExtractionResult {
	cookies: TwitterCookies;
	warnings: string[];
}

function normalizeValue(value: unknown): string | null {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	return null;
}

function getChromeCookiesPath(profile?: string): string {
	const home = process.env.HOME || '';
	const profileDir = profile || 'Default';
	return join(home, 'Library', 'Application Support', 'Google', 'Chrome', profileDir, 'Cookies');
}

/**
 * Decrypt Chrome cookie value using macOS keychain
 * Chrome encrypts cookies with a key stored in the keychain
 */
function decryptCookieValue(encryptedHex: string): string | null {
	try {
		// Convert hex to buffer
		const encryptedValue = Buffer.from(encryptedHex, 'hex');

		if (encryptedValue.length < 4) {
			return null;
		}

		const version = encryptedValue.subarray(0, 3).toString('utf8');
		if (version !== 'v10' && version !== 'v11') {
			// Not encrypted, just return as string
			return encryptedValue.toString('utf8');
		}

		// Get encryption key from keychain
		const keyOutput = execSync('security find-generic-password -s "Chrome Safe Storage" -w 2>/dev/null || echo ""', {
			encoding: 'utf8',
		}).trim();

		if (!keyOutput) {
			return null;
		}

		// Derive the key using PBKDF2
		const salt = 'saltysalt';
		const iterations = 1003;
		const keyLength = 16;

		const derivedKey = pbkdf2Sync(keyOutput, salt, iterations, keyLength, 'sha1');

		// Decrypt using AES-128-CBC with empty IV (16 bytes of 0x20/space)
		const iv = Buffer.alloc(16, 0x20);
		const encryptedData = encryptedValue.subarray(3); // Skip "v10" or "v11" prefix

		const decipher = createDecipheriv('aes-128-cbc', derivedKey, iv);
		decipher.setAutoPadding(true);

		let decrypted = decipher.update(encryptedData);
		decrypted = Buffer.concat([decrypted, decipher.final()]);

		return decrypted.toString('utf8');
	} catch {
		return null;
	}
}

/**
 * Extract Twitter cookies from Chrome browser using sqlite3 CLI
 * @param profile - Chrome profile name (optional, uses Default if not specified)
 */
export async function extractCookiesFromChrome(profile?: string): Promise<CookieExtractionResult> {
	const warnings: string[] = [];
	const cookies: TwitterCookies = {
		authToken: null,
		ct0: null,
		source: null,
	};

	const cookiesPath = getChromeCookiesPath(profile);

	if (!existsSync(cookiesPath)) {
		warnings.push(`Chrome cookies database not found at: ${cookiesPath}`);
		return { cookies, warnings };
	}

	// Chrome locks the database, so we need to copy it
	let tempDir: string | null = null;

	try {
		tempDir = mkdtempSync(join(tmpdir(), 'twitter-cli-'));
		const tempDbPath = join(tempDir, 'Cookies');
		copyFileSync(cookiesPath, tempDbPath);

		// Also copy the WAL and SHM files if they exist
		const walPath = `${cookiesPath}-wal`;
		const shmPath = `${cookiesPath}-shm`;
		if (existsSync(walPath)) {
			copyFileSync(walPath, `${tempDbPath}-wal`);
		}
		if (existsSync(shmPath)) {
			copyFileSync(shmPath, `${tempDbPath}-shm`);
		}

		// Use sqlite3 CLI to query cookies (no native deps required!)
		const query = `SELECT name, hex(encrypted_value) as encrypted_hex FROM cookies WHERE host_key IN ('.x.com', '.twitter.com', 'x.com', 'twitter.com') AND name IN ('auth_token', 'ct0');`;

		const result = execSync(`sqlite3 -separator '|' "${tempDbPath}" "${query}"`, {
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
		}).trim();

		if (result) {
			for (const line of result.split('\n')) {
				const [name, encryptedHex] = line.split('|');
				if (!name || !encryptedHex) continue;

				const decryptedValue = decryptCookieValue(encryptedHex);
				if (decryptedValue) {
					if (name === 'auth_token' && !cookies.authToken) {
						cookies.authToken = decryptedValue;
					} else if (name === 'ct0' && !cookies.ct0) {
						cookies.ct0 = decryptedValue;
					}
				}
			}
		}

		if (cookies.authToken || cookies.ct0) {
			cookies.source = profile ? `Chrome profile "${profile}"` : 'Chrome default profile';
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		warnings.push(`Failed to read Chrome cookies: ${message}`);
	} finally {
		// Cleanup temp files
		if (tempDir) {
			try {
				rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	if (!cookies.authToken && !cookies.ct0) {
		warnings.push('No Twitter cookies found in Chrome. Make sure you are logged into x.com in Chrome.');
	}

	return { cookies, warnings };
}

/**
 * Resolve Twitter credentials from multiple sources
 * Priority: CLI args > environment variables > Chrome cookies
 */
export async function resolveCredentials(options: {
	authToken?: string;
	ct0?: string;
	chromeProfile?: string;
}): Promise<CookieExtractionResult> {
	const warnings: string[] = [];
	const cookies: TwitterCookies = {
		authToken: null,
		ct0: null,
		source: null,
	};

	// 1. CLI arguments (highest priority)
	if (options.authToken) {
		cookies.authToken = options.authToken;
		cookies.source = 'CLI argument';
	}
	if (options.ct0) {
		cookies.ct0 = options.ct0;
		if (!cookies.source) cookies.source = 'CLI argument';
	}

	// 2. Environment variables
	const envAuthKeys = ['AUTH_TOKEN', 'TWITTER_AUTH_TOKEN'];
	const envCt0Keys = ['CT0', 'TWITTER_CT0'];

	if (!cookies.authToken) {
		for (const key of envAuthKeys) {
			const value = normalizeValue(process.env[key]);
			if (value) {
				cookies.authToken = value;
				cookies.source = `env ${key}`;
				break;
			}
		}
	}

	if (!cookies.ct0) {
		for (const key of envCt0Keys) {
			const value = normalizeValue(process.env[key]);
			if (value) {
				cookies.ct0 = value;
				if (!cookies.source) cookies.source = `env ${key}`;
				break;
			}
		}
	}

	// 3. Chrome cookies (fallback)
	if (!cookies.authToken || !cookies.ct0) {
		const chromeResult = await extractCookiesFromChrome(options.chromeProfile);
		warnings.push(...chromeResult.warnings);

		if (!cookies.authToken && chromeResult.cookies.authToken) {
			cookies.authToken = chromeResult.cookies.authToken;
			cookies.source = chromeResult.cookies.source;
		}
		if (!cookies.ct0 && chromeResult.cookies.ct0) {
			cookies.ct0 = chromeResult.cookies.ct0;
			if (!cookies.source) cookies.source = chromeResult.cookies.source;
		}
	}

	// Validation
	if (!cookies.authToken) {
		warnings.push('Missing auth_token - provide via --auth-token, AUTH_TOKEN env var, or login to x.com in Chrome');
	}
	if (!cookies.ct0) {
		warnings.push('Missing ct0 - provide via --ct0, CT0 env var, or login to x.com in Chrome');
	}

	return { cookies, warnings };
}
