import { createContextLogger } from './logger';
import { INTEGRATION_ENCRYPTION_KEY } from '$env/static/private';

const logger = createContextLogger('encryption');

/**
 * Encrypt sensitive data using AES-256-GCM
 * Uses Web Crypto API for encryption
 */
export async function encrypt(plaintext: string): Promise<string> {
	if (!INTEGRATION_ENCRYPTION_KEY) {
		logger.warn('INTEGRATION_ENCRYPTION_KEY not set - storing data unencrypted');
		return plaintext;
	}

	try {
		const encoder = new TextEncoder();
		const data = encoder.encode(plaintext);

		// Generate a random initialization vector
		const iv = crypto.getRandomValues(new Uint8Array(12));

		// Derive encryption key from the environment variable
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(INTEGRATION_ENCRYPTION_KEY),
			{ name: 'PBKDF2' },
			false,
			['deriveBits', 'deriveKey']
		);

		const key = await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: encoder.encode('blip-integrations-salt'), // Static salt for consistency
				iterations: 100000,
				hash: 'SHA-256'
			},
			keyMaterial,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);

		// Encrypt the data
		const encrypted = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv
			},
			key,
			data
		);

		// Combine IV and encrypted data
		const combined = new Uint8Array(iv.length + encrypted.byteLength);
		combined.set(iv);
		combined.set(new Uint8Array(encrypted), iv.length);

		// Return as base64
		return Buffer.from(combined).toString('base64');
	} catch (error) {
		logger.error('Encryption failed', error as Error);
		throw new Error('Failed to encrypt data');
	}
}

/**
 * Decrypt sensitive data encrypted with encrypt()
 */
export async function decrypt(encryptedData: string): Promise<string> {
	if (!INTEGRATION_ENCRYPTION_KEY) {
		logger.warn('INTEGRATION_ENCRYPTION_KEY not set - returning data as-is');
		return encryptedData;
	}

	try {
		const encoder = new TextEncoder();
		const decoder = new TextDecoder();

		// Decode from base64
		const combined = new Uint8Array(Buffer.from(encryptedData, 'base64'));

		// Extract IV and encrypted data
		const iv = combined.slice(0, 12);
		const encrypted = combined.slice(12);

		// Derive decryption key (same process as encryption)
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(INTEGRATION_ENCRYPTION_KEY),
			{ name: 'PBKDF2' },
			false,
			['deriveBits', 'deriveKey']
		);

		const key = await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: encoder.encode('blip-integrations-salt'),
				iterations: 100000,
				hash: 'SHA-256'
			},
			keyMaterial,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);

		// Decrypt the data
		const decrypted = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv
			},
			key,
			encrypted
		);

		return decoder.decode(decrypted);
	} catch (error) {
		logger.error('Decryption failed', error as Error);
		throw new Error('Failed to decrypt data');
	}
}

/**
 * Encrypt sensitive fields in integration config
 */
export async function encryptIntegrationConfig(
	config: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const sensitiveFields = ['botToken', 'webhookUrl', 'apiKey'];
	const encrypted = { ...config };

	for (const field of sensitiveFields) {
		if (encrypted[field] && typeof encrypted[field] === 'string') {
			encrypted[field] = await encrypt(encrypted[field] as string);
		}
	}

	return encrypted;
}

/**
 * Decrypt sensitive fields in integration config
 */
export async function decryptIntegrationConfig(
	config: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const sensitiveFields = ['botToken', 'webhookUrl', 'apiKey'];
	const decrypted = { ...config };

	for (const field of sensitiveFields) {
		if (decrypted[field] && typeof decrypted[field] === 'string') {
			try {
				decrypted[field] = await decrypt(decrypted[field] as string);
			} catch (error) {
				// If decryption fails, it might be unencrypted legacy data
				logger.warn(`Failed to decrypt ${field}, using as-is (may be legacy unencrypted data)`);
			}
		}
	}

	return decrypted;
}
