import { describe, it, expect, beforeAll } from 'vitest';
import {
	encrypt,
	decrypt,
	encryptIntegrationConfig,
	decryptIntegrationConfig,
	validateEncryptionKey,
	DecryptionError,
	SENSITIVE_INTEGRATION_FIELDS
} from './encryption';

describe('Encryption System', () => {
	beforeAll(() => {
		// Ensure encryption key is validated before tests
		validateEncryptionKey();
	});

	describe('Key Validation', () => {
		it('should validate encryption key successfully', () => {
			expect(() => validateEncryptionKey()).not.toThrow();
		});
	});

	describe('Basic Encryption/Decryption', () => {
		it('should encrypt and decrypt a string', async () => {
			const plaintext = 'test-secret-data';
			const encrypted = await encrypt(plaintext);
			const decrypted = await decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it('should produce different ciphertext for same plaintext', async () => {
			const plaintext = 'test-secret-data';
			const encrypted1 = await encrypt(plaintext);
			const encrypted2 = await encrypt(plaintext);

			// Different ciphertext due to random salt and IV
			expect(encrypted1).not.toBe(encrypted2);

			// But both decrypt to same plaintext
			const decrypted1 = await decrypt(encrypted1);
			const decrypted2 = await decrypt(encrypted2);
			expect(decrypted1).toBe(plaintext);
			expect(decrypted2).toBe(plaintext);
		});

		it('should handle empty strings', async () => {
			const plaintext = '';
			const encrypted = await encrypt(plaintext);
			const decrypted = await decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it('should handle special characters', async () => {
			const plaintext = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`';
			const encrypted = await encrypt(plaintext);
			const decrypted = await decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it('should handle unicode characters', async () => {
			const plaintext = '你好世界 🔐 مرحبا بالعالم';
			const encrypted = await encrypt(plaintext);
			const decrypted = await decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it('should handle long strings', async () => {
			const plaintext = 'a'.repeat(10000);
			const encrypted = await encrypt(plaintext);
			const decrypted = await decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});
	});

	describe('Format Detection', () => {
		it('should return encrypted data in base64 format', async () => {
			const plaintext = 'test-data';
			const encrypted = await encrypt(plaintext);

			// Should be valid base64
			expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();

			// Should have minimum expected length
			// version(1) + salt(16) + iv(12) + ciphertext(min 16) = 45 bytes minimum
			const decoded = Buffer.from(encrypted, 'base64');
			expect(decoded.length).toBeGreaterThanOrEqual(45);
		});

		it('should include version byte', async () => {
			const plaintext = 'test-data';
			const encrypted = await encrypt(plaintext);

			const decoded = Buffer.from(encrypted, 'base64');
			// First byte should be version 0x01
			expect(decoded[0]).toBe(0x01);
		});
	});

	describe('Error Handling', () => {
		it('should throw DecryptionError for invalid base64', async () => {
			await expect(decrypt('not-valid-base64!@#$')).rejects.toThrow();
		});

		it('should throw DecryptionError for too short data', async () => {
			const tooShort = Buffer.from([1, 2, 3]).toString('base64');
			await expect(decrypt(tooShort)).rejects.toThrow(DecryptionError);
		});

		it('should throw DecryptionError for corrupted data', async () => {
			const plaintext = 'test-data';
			const encrypted = await encrypt(plaintext);

			// Corrupt the encrypted data
			const decoded = Buffer.from(encrypted, 'base64');
			decoded[decoded.length - 1] ^= 0xff; // Flip last byte
			const corrupted = decoded.toString('base64');

			await expect(decrypt(corrupted)).rejects.toThrow(DecryptionError);
		});

		it('should throw DecryptionError for unsupported version', async () => {
			const plaintext = 'test-data';
			const encrypted = await encrypt(plaintext);

			// Change version byte to unsupported version
			const decoded = Buffer.from(encrypted, 'base64');
			decoded[0] = 0x99; // Unsupported version
			const invalidVersion = decoded.toString('base64');

			await expect(decrypt(invalidVersion)).rejects.toThrow(DecryptionError);
			await expect(decrypt(invalidVersion)).rejects.toThrow(/unsupported encryption version/i);
		});
	});

	describe('Integration Config Encryption', () => {
		it('should encrypt sensitive fields only', async () => {
			const config = {
				botToken: 'xoxb-secret-token',
				apiKey: 'sk-secret-key',
				webhookUrl: 'https://example.com/webhook',
				// Non-sensitive fields
				channelName: 'general',
				enabled: true,
				scope: 'organization'
			};

			const encrypted = await encryptIntegrationConfig(config);

			// Sensitive fields should be encrypted (different from original)
			expect(encrypted.botToken).not.toBe(config.botToken);
			expect(encrypted.apiKey).not.toBe(config.apiKey);
			expect(encrypted.webhookUrl).not.toBe(config.webhookUrl);

			// Non-sensitive fields should be unchanged
			expect(encrypted.channelName).toBe(config.channelName);
			expect(encrypted.enabled).toBe(config.enabled);
			expect(encrypted.scope).toBe(config.scope);
		});

		it('should decrypt config fields correctly', async () => {
			const original = {
				botToken: 'xoxb-secret-token',
				apiKey: 'sk-secret-key',
				channelName: 'general'
			};

			const encrypted = await encryptIntegrationConfig(original);
			const decrypted = await decryptIntegrationConfig(encrypted);

			expect(decrypted.botToken).toBe(original.botToken);
			expect(decrypted.apiKey).toBe(original.apiKey);
			expect(decrypted.channelName).toBe(original.channelName);
		});

		it('should handle config with no sensitive fields', async () => {
			const config = {
				channelName: 'general',
				enabled: true
			};

			const encrypted = await encryptIntegrationConfig(config);
			const decrypted = await decryptIntegrationConfig(encrypted);

			expect(decrypted).toEqual(config);
		});

		it('should handle config with null/undefined fields', async () => {
			const config = {
				botToken: 'xoxb-secret',
				apiKey: null,
				webhookUrl: undefined,
				channelName: 'general'
			};

			const encrypted = await encryptIntegrationConfig(config);
			const decrypted = await decryptIntegrationConfig(encrypted);

			expect(decrypted.botToken).toBe(config.botToken);
			expect(decrypted.apiKey).toBeNull();
			expect(decrypted.webhookUrl).toBeUndefined();
			expect(decrypted.channelName).toBe(config.channelName);
		});

		it('should encrypt all sensitive fields defined in SENSITIVE_INTEGRATION_FIELDS', async () => {
			// Create config with all sensitive fields
			const config: Record<string, string> = {};
			for (const field of SENSITIVE_INTEGRATION_FIELDS) {
				config[field] = `secret-${field}-value`;
			}

			const encrypted = await encryptIntegrationConfig(config);

			// All should be encrypted (different from original)
			for (const field of SENSITIVE_INTEGRATION_FIELDS) {
				expect(encrypted[field]).not.toBe(config[field]);
				expect(typeof encrypted[field]).toBe('string');
			}

			// Decrypt and verify
			const decrypted = await decryptIntegrationConfig(encrypted);
			for (const field of SENSITIVE_INTEGRATION_FIELDS) {
				expect(decrypted[field]).toBe(config[field]);
			}
		});
	});

	describe('Integration Config Roundtrip', () => {
		it('should handle multiple encrypt/decrypt cycles', async () => {
			const original = {
				botToken: 'xoxb-secret-token',
				apiKey: 'sk-secret-key',
				webhookUrl: 'https://example.com/webhook'
			};

			// Multiple cycles
			let current: Record<string, unknown> = original;
			for (let i = 0; i < 3; i++) {
				const encrypted = await encryptIntegrationConfig(current);
				current = await decryptIntegrationConfig(encrypted);
			}

			expect(current).toEqual(original);
		});
	});

	describe('Security Properties', () => {
		it('should use different salts for each encryption', async () => {
			const plaintext = 'test-data';
			const encrypted1 = await encrypt(plaintext);
			const encrypted2 = await encrypt(plaintext);

			const decoded1 = Buffer.from(encrypted1, 'base64');
			const decoded2 = Buffer.from(encrypted2, 'base64');

			// Extract salts (bytes 1-17, after version byte)
			const salt1 = decoded1.slice(1, 17);
			const salt2 = decoded2.slice(1, 17);

			// Salts should be different
			expect(Buffer.compare(salt1, salt2)).not.toBe(0);
		});

		it('should use different IVs for each encryption', async () => {
			const plaintext = 'test-data';
			const encrypted1 = await encrypt(plaintext);
			const encrypted2 = await encrypt(plaintext);

			const decoded1 = Buffer.from(encrypted1, 'base64');
			const decoded2 = Buffer.from(encrypted2, 'base64');

			// Extract IVs (bytes 17-29, after version + salt)
			const iv1 = decoded1.slice(17, 29);
			const iv2 = decoded2.slice(17, 29);

			// IVs should be different
			expect(Buffer.compare(iv1, iv2)).not.toBe(0);
		});

		it('should not leak plaintext length precisely', async () => {
			// AES-GCM adds a 16-byte authentication tag
			// So ciphertext length = plaintext length + 16

			const short = await encrypt('a');
			const long = await encrypt('a'.repeat(100));

			const shortDecoded = Buffer.from(short, 'base64');
			const longDecoded = Buffer.from(long, 'base64');

			// Both should have version(1) + salt(16) + iv(12) = 29 bytes overhead
			// Plus plaintext + 16-byte auth tag
			expect(shortDecoded.length).toBe(29 + 1 + 16);
			expect(longDecoded.length).toBe(29 + 100 + 16);
		});
	});
});
