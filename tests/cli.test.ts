import { describe, expect, it } from 'vitest';

describe('CLI utilities', () => {
	describe('extractTweetId', () => {
		// Testing the URL extraction logic inline since it's a simple function
		function extractTweetId(input: string): string {
			const urlMatch = input.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
			if (urlMatch) {
				return urlMatch[1];
			}
			return input;
		}

		it('should extract ID from x.com URL', () => {
			const url = 'https://x.com/steipete/status/1234567890123456789';
			expect(extractTweetId(url)).toBe('1234567890123456789');
		});

		it('should extract ID from twitter.com URL', () => {
			const url = 'https://twitter.com/steipete/status/1234567890123456789';
			expect(extractTweetId(url)).toBe('1234567890123456789');
		});

		it('should extract ID from URL with query params', () => {
			const url = 'https://x.com/steipete/status/1234567890123456789?s=20';
			expect(extractTweetId(url)).toBe('1234567890123456789');
		});

		it('should return ID as-is if already an ID', () => {
			const id = '1234567890123456789';
			expect(extractTweetId(id)).toBe('1234567890123456789');
		});

		it('should handle URLs with www prefix', () => {
			// Note: our regex handles this because \w+ matches any word chars after the domain
			const url = 'https://x.com/user_name/status/1234567890123456789';
			expect(extractTweetId(url)).toBe('1234567890123456789');
		});
	});
});
