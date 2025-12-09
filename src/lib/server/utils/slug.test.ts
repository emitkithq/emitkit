import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
	describe('basic transformations', () => {
		it('converts uppercase to lowercase', () => {
			expect(slugify('Hello World')).toBe('hello-world');
			expect(slugify('SDK TEST')).toBe('sdk-test');
			expect(slugify('CamelCaseTest')).toBe('camelcasetest');
		});

		it('replaces spaces with hyphens', () => {
			expect(slugify('User Events')).toBe('user-events');
			expect(slugify('API Requests')).toBe('api-requests');
			expect(slugify('Multiple Word Test')).toBe('multiple-word-test');
		});

		it('handles multiple consecutive spaces', () => {
			expect(slugify('Test  Multiple   Spaces')).toBe('test-multiple-spaces');
			expect(slugify('Too    Many     Spaces')).toBe('too-many-spaces');
		});

		it('converts underscores to hyphens', () => {
			expect(slugify('Under_score_test')).toBe('under-score-test');
			expect(slugify('snake_case_name')).toBe('snake-case-name');
		});

		it('preserves existing hyphens', () => {
			expect(slugify('already-hyphenated')).toBe('already-hyphenated');
			expect(slugify('sdk-test')).toBe('sdk-test');
		});

		it('trims leading and trailing whitespace', () => {
			expect(slugify('  Leading and Trailing  ')).toBe('leading-and-trailing');
			expect(slugify('   Extra Spaces   ')).toBe('extra-spaces');
		});
	});

	describe('special characters', () => {
		it('removes special characters', () => {
			expect(slugify('Special!@#$%Characters')).toBe('specialcharacters');
			expect(slugify('Test & Test')).toBe('test-test');
			expect(slugify('Price: $99.99')).toBe('price-9999');
			expect(slugify('Hello, World!')).toBe('hello-world');
		});

		it('handles parentheses and brackets', () => {
			expect(slugify('Test (v2)')).toBe('test-v2');
			expect(slugify('Array[0]')).toBe('array0');
			expect(slugify('Object {key}')).toBe('object-key');
		});

		it('removes quotes and apostrophes', () => {
			expect(slugify(`Test's Name`)).toBe('tests-name');
			expect(slugify(`"Quoted Text"`)).toBe('quoted-text');
			expect(slugify("It's a test")).toBe('its-a-test');
		});
	});

	describe('emojis and unicode', () => {
		it('removes emojis', () => {
			expect(slugify('Hello 👋 World')).toBe('hello-world');
			expect(slugify('🎉 Party Time 🎊')).toBe('party-time');
			expect(slugify('💰 Payment Received')).toBe('payment-received');
			expect(slugify('🔄 Sync Status')).toBe('sync-status');
		});

		it('handles multiple emojis', () => {
			expect(slugify('🚀 ⚡ 💻 Tech Stack')).toBe('tech-stack');
			expect(slugify('User 👤 Event 📅 Log 📝')).toBe('user-event-log');
		});

		it('handles unicode characters', () => {
			expect(slugify('Café')).toBe('caf');
			expect(slugify('Naïve')).toBe('nave');
			expect(slugify('Señor')).toBe('seor');
		});

		it('handles emoji-only strings', () => {
			expect(slugify('🎉🎊🎈')).toBe('');
			expect(slugify('👋')).toBe('');
		});
	});

	describe('edge cases', () => {
		it('handles empty string', () => {
			expect(slugify('')).toBe('');
		});

		it('handles whitespace-only string', () => {
			expect(slugify('   ')).toBe('');
			expect(slugify('\t\n')).toBe('');
		});

		it('handles special-characters-only string', () => {
			expect(slugify('!@#$%^&*()')).toBe('');
			expect(slugify('---')).toBe('');
		});

		it('removes leading and trailing hyphens', () => {
			expect(slugify('-leading')).toBe('leading');
			expect(slugify('trailing-')).toBe('trailing');
			expect(slugify('-both-')).toBe('both');
			expect(slugify('---multiple---')).toBe('multiple');
		});

		it('handles very long strings', () => {
			const longString = 'a'.repeat(100) + ' ' + 'b'.repeat(100);
			const result = slugify(longString);
			expect(result).toBe('a'.repeat(100) + '-' + 'b'.repeat(100));
		});

		it('handles numbers', () => {
			expect(slugify('Test 123')).toBe('test-123');
			expect(slugify('v2.0.1')).toBe('v201');
			expect(slugify('2024-12-03')).toBe('2024-12-03');
		});
	});

	describe('real-world examples', () => {
		it('handles channel names', () => {
			expect(slugify('SDK Test')).toBe('sdk-test');
			expect(slugify('idempotency-test')).toBe('idempotency-test');
			expect(slugify('User Events')).toBe('user-events');
			expect(slugify('API Requests')).toBe('api-requests');
		});

		it('handles event names', () => {
			expect(slugify('Payment Received 💰')).toBe('payment-received');
			expect(slugify('User Signed Up ✅')).toBe('user-signed-up');
			expect(slugify('Error: 404 Not Found')).toBe('error-404-not-found');
		});

		it('handles mixed case with special characters', () => {
			expect(slugify('NEW_User_SIGNUP')).toBe('new-user-signup');
			expect(slugify('order.completed')).toBe('ordercompleted');
			expect(slugify('webhook/received')).toBe('webhookreceived');
		});
	});

	describe('consistency', () => {
		it('produces same output for semantically similar inputs', () => {
			expect(slugify('Hello World')).toBe('hello-world');
			expect(slugify('hello world')).toBe('hello-world');
			expect(slugify('Hello-World')).toBe('hello-world');
			expect(slugify('hello_world')).toBe('hello-world');
			expect(slugify('HELLO WORLD')).toBe('hello-world');
		});

		it('handles idempotency (running slugify twice)', () => {
			const input = 'Hello World!';
			const once = slugify(input);
			const twice = slugify(once);
			expect(once).toBe(twice);
			expect(once).toBe('hello-world');
		});
	});
});
