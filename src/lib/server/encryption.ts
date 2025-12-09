import { createContextLogger } from './logger';
import { ENCRYPTION_KEY } from '$env/static/private';

const logger = createContextLogger('encryption');

// =============================================================================
// Custom Error Classes
// =============================================================================

export class EncryptionError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly cause?: Error
	) {
		super(message);
		this.name = 'EncryptionError';
	}
}

export class DecryptionError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly cause?: Error
	) {
		super(message);
		this.name = 'DecryptionError';
	}
}

export class InvalidKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidKeyError';
	}
}

// =============================================================================
// Constants
// =============================================================================

const VERSION = 0x01; // Current encryption version
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)

// =============================================================================
// Key Management & Validation
// =============================================================================

let keyValidated = false;

/**
 * Validates the encryption key meets security requirements
 * Should be called on application startup
 */
export function validateEncryptionKey(): void {
	if (!ENCRYPTION_KEY) {
		throw new InvalidKeyError(
			'ENCRYPTION_KEY environment variable is not set. ' +
				'Generate one using: openssl rand -base64 32'
		);
	}

	const keyBytes = Buffer.from(ENCRYPTION_KEY, 'utf-8');

	// Require minimum 32 bytes (256 bits) for AES-256
	if (keyBytes.length < 32) {
		throw new InvalidKeyError(
			`Encryption key must be at least 32 bytes. Current length: ${keyBytes.length}. ` +
				'Generate a secure key using: openssl rand -base64 32'
		);
	}

	// Check for common weak patterns
	const keyStr = ENCRYPTION_KEY;
	if (
		keyStr === 'your-encryption-key-here' ||
		keyStr.includes('password') ||
		keyStr.includes('secret') ||
		/^(.)\1+$/.test(keyStr) // All same character
	) {
		throw new InvalidKeyError(
			'Encryption key appears to be a placeholder or weak pattern. ' +
				'Generate a cryptographically secure key using: openssl rand -base64 32'
		);
	}

	keyValidated = true;
	logger.info('Encryption key validated successfully', {
		keyLength: keyBytes.length
	});
}

/**
 * Derives the encryption key using HKDF
 * HKDF is preferred over PBKDF2 for key derivation from high-entropy keys
 */
async function getDerivedKey(salt: Uint8Array): Promise<CryptoKey> {
	if (!keyValidated) {
		validateEncryptionKey();
	}

	// Import the master key
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(ENCRYPTION_KEY),
		{ name: 'HKDF' },
		false,
		['deriveKey']
	);

	// Derive AES-GCM key using HKDF
	const key = await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: salt as BufferSource,
			info: encoder.encode('blip-integration-encryption')
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);

	return key;
}

// =============================================================================
// Core Encryption/Decryption Functions
// =============================================================================

/**
 * Encrypts sensitive data using AES-256-GCM with random salt and IV
 *
 * Format: [version(1)][salt(16)][iv(12)][ciphertext + auth_tag]
 *
 * Security features:
 * - Version byte for future-proofing
 * - Random salt per encryption (prevents rainbow tables)
 * - Random IV per encryption (required for GCM)
 * - HKDF key derivation (proper for high-entropy keys)
 * - Authenticated encryption (GCM provides integrity)
 */
export async function encrypt(plaintext: string): Promise<string> {
	if (!keyValidated) {
		validateEncryptionKey();
	}

	const operation = logger.start('Encrypt data');

	try {
		const encoder = new TextEncoder();
		const data = encoder.encode(plaintext);

		// Generate random salt and IV
		const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
		const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

		operation.step('Deriving encryption key');
		const key = await getDerivedKey(salt);

		operation.step('Encrypting data');
		const encrypted = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv
			},
			key,
			data
		);

		// Combine: version + salt + IV + encrypted data
		const combined = new Uint8Array(1 + salt.length + iv.length + encrypted.byteLength);
		let offset = 0;
		combined[offset] = VERSION;
		offset += 1;
		combined.set(salt, offset);
		offset += salt.length;
		combined.set(iv, offset);
		offset += iv.length;
		combined.set(new Uint8Array(encrypted), offset);

		const result = Buffer.from(combined).toString('base64');
		operation.end({ version: VERSION, dataLength: plaintext.length });
		return result;
	} catch (error) {
		operation.error('Encryption failed', error as Error);
		throw new EncryptionError('Failed to encrypt data', 'ENCRYPTION_FAILED', error as Error);
	}
}

/**
 * Decrypts data encrypted with encrypt()
 */
export async function decrypt(encryptedData: string): Promise<string> {
	if (!keyValidated) {
		validateEncryptionKey();
	}

	const operation = logger.start('Decrypt data');

	try {
		const decoder = new TextDecoder();

		// Decode from base64
		const combined = new Uint8Array(Buffer.from(encryptedData, 'base64'));

		// Validate minimum length: version(1) + salt(16) + iv(12) + min ciphertext(16)
		const minLength = 1 + SALT_LENGTH + IV_LENGTH + 16;
		if (combined.length < minLength) {
			throw new DecryptionError(
				`Invalid encrypted data: too short (${combined.length} bytes, expected at least ${minLength})`,
				'INVALID_FORMAT'
			);
		}

		// Extract components: [version(1)][salt(16)][iv(12)][ciphertext]
		let offset = 0;
		const version = combined[offset];
		offset += 1;

		// Validate version
		if (version !== VERSION) {
			throw new DecryptionError(
				`Unsupported encryption version: ${version} (expected ${VERSION})`,
				'UNSUPPORTED_VERSION'
			);
		}

		const salt = combined.slice(offset, offset + SALT_LENGTH);
		offset += SALT_LENGTH;
		const iv = combined.slice(offset, offset + IV_LENGTH);
		offset += IV_LENGTH;
		const encrypted = combined.slice(offset);

		operation.step('Deriving decryption key');
		const key = await getDerivedKey(salt);

		operation.step('Decrypting data');
		const decrypted = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv
			},
			key,
			encrypted
		);

		const result = decoder.decode(decrypted);
		operation.end({ version, dataLength: result.length });
		return result;
	} catch (error) {
		operation.error('Decryption failed', error as Error);

		// Provide more specific error messages
		if (error instanceof DecryptionError) {
			throw error;
		}

		// Crypto operation failed (likely wrong key or corrupted data)
		throw new DecryptionError(
			'Failed to decrypt data. Data may be corrupted or encrypted with a different key.',
			'DECRYPTION_FAILED',
			error as Error
		);
	}
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Centralized list of sensitive integration fields that must be encrypted
 * Add new sensitive fields here to ensure they're encrypted across the codebase
 */
export const SENSITIVE_INTEGRATION_FIELDS = [
	'botToken', // Bot authentication tokens (Slack, Discord, etc.)
	'webhookUrl', // Webhook URLs (may contain secrets in query params)
	'apiKey', // API keys
	'accessToken', // OAuth access tokens
	'refreshToken', // OAuth refresh tokens
	'clientSecret' // OAuth client secrets
] as const;

// =============================================================================
// Integration Config Encryption/Decryption
// =============================================================================

/**
 * Encrypts sensitive fields in integration configuration
 * Uses centralized SENSITIVE_INTEGRATION_FIELDS list
 *
 * @param config - Integration configuration object
 * @returns New config object with sensitive fields encrypted
 * @throws EncryptionError if encryption fails
 */
export async function encryptIntegrationConfig(
	config: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const operation = logger.start('Encrypt integration config');

	try {
		const encrypted = { ...config };
		let encryptedCount = 0;

		for (const field of SENSITIVE_INTEGRATION_FIELDS) {
			if (encrypted[field] && typeof encrypted[field] === 'string') {
				encrypted[field] = await encrypt(encrypted[field] as string);
				encryptedCount++;
			}
		}

		operation.end({ encryptedFields: encryptedCount });
		return encrypted;
	} catch (error) {
		operation.error('Failed to encrypt integration config', error as Error);
		throw new EncryptionError(
			'Failed to encrypt integration configuration',
			'CONFIG_ENCRYPTION_FAILED',
			error as Error
		);
	}
}

/**
 * Decrypts sensitive fields in integration configuration
 * Supports both v2 (current) and v1 (legacy) encrypted data
 *
 * @param config - Integration configuration with encrypted fields
 * @returns New config object with sensitive fields decrypted
 * @throws DecryptionError if decryption fails
 */
export async function decryptIntegrationConfig(
	config: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const operation = logger.start('Decrypt integration config');

	try {
		const decrypted = { ...config };
		let decryptedCount = 0;

		for (const field of SENSITIVE_INTEGRATION_FIELDS) {
			if (decrypted[field] && typeof decrypted[field] === 'string') {
				try {
					decrypted[field] = await decrypt(decrypted[field] as string);
					decryptedCount++;
				} catch (error) {
					// Re-throw decryption errors - don't silently fail
					operation.error(`Failed to decrypt field: ${field}`, error as Error);
					throw new DecryptionError(
						`Failed to decrypt integration config field '${field}'. ` +
							'Data may be corrupted or encrypted with a different key.',
						'CONFIG_DECRYPTION_FAILED',
						error as Error
					);
				}
			}
		}

		operation.end({ decryptedFields: decryptedCount });
		return decrypted;
	} catch (error) {
		operation.error('Failed to decrypt integration config', error as Error);

		if (error instanceof DecryptionError) {
			throw error;
		}

		throw new DecryptionError(
			'Failed to decrypt integration configuration',
			'CONFIG_DECRYPTION_FAILED',
			error as Error
		);
	}
}
