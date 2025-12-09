import { env } from '$env/dynamic/private';
import { trace, type Span, SpanStatusCode } from '@opentelemetry/api';

// Terminal symbols for clean span-style output
const SYMBOLS = {
	start: '┌', // Start of operation/span
	step: '├', // Step in operation
	end: '└', // End of operation
	success: '✓', // Success
	error: '✗', // Error
	warning: '⚠', // Warning
	info: '·', // Info point (minimal)
	time: '', // Timing (use just the number)
	arrow: '→' // Flow indicator
} as const;

// Log levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Metadata type
type Metadata = Record<string, unknown>;

// Logger options
interface LoggerOptions {
	context: string;
	requestId?: string;
	userId?: string;
	metadata?: Metadata;
}

const isProduction = env.VERCEL === '1';

// Internal state for async context
class AsyncContext {
	private static storage = new Map<string, unknown>();

	static set(key: string, value: unknown): void {
		this.storage.set(key, value);
	}

	static get<T>(key: string): T | undefined {
		return this.storage.get(key) as T | undefined;
	}

	static clear(): void {
		this.storage.clear();
	}
}

export class Logger {
	private context: string;
	private requestId?: string;
	private userId?: string;
	private metadata: Metadata;
	private tracer = trace.getTracer('jobboard-logger');
	private startTime?: number;

	constructor(options: LoggerOptions) {
		this.context = options.context;
		this.requestId = options.requestId;
		this.userId = options.userId;
		this.metadata = options.metadata || {};
	}

	/**
	 * Create a child logger with additional context
	 */
	child(childContext: string, metadata?: Metadata): Logger {
		return new Logger({
			context: `${this.context}:${childContext}`,
			requestId: this.requestId,
			userId: this.userId,
			metadata: { ...this.metadata, ...metadata }
		});
	}

	/**
	 * Start a new operation with timing and OpenTelemetry span
	 */
	start(operation: string, metadata?: Metadata): OperationLogger {
		const span = this.tracer.startSpan(operation, {
			attributes: {
				'service.name': 'jobboard',
				'operation.context': this.context,
				'request.id': this.requestId || 'unknown',
				'user.id': this.userId || 'anonymous',
				...this.flattenMetadata(metadata)
			}
		});

		this.log('info', `${SYMBOLS.start} ${operation}`, metadata);

		return new OperationLogger(this, operation, span, performance.now());
	}

	/**
	 * Log a step in the current operation
	 */
	step(message: string, metadata?: Metadata): void {
		this.log('info', `${SYMBOLS.step} ${message}`, metadata);
	}

	/**
	 * Log success
	 */
	success(message: string, metadata?: Metadata): void {
		this.log('info', `  ${SYMBOLS.success} ${message}`, metadata);
	}

	/**
	 * Log info
	 */
	info(message: string, metadata?: Metadata): void {
		this.log('info', `  ${SYMBOLS.info} ${message}`, metadata);
	}

	/**
	 * Log warning
	 */
	warn(message: string, metadata?: Metadata): void {
		this.log('warn', `  ${SYMBOLS.warning} ${message}`, metadata);
	}

	/**
	 * Log error and capture in Sentry
	 */
	error(message: string, error?: unknown, metadata?: Metadata): void {
		this.log('error', `${SYMBOLS.error} ${message}`, metadata, error);

		// TODO: Enable optional sentry integration and Capture in Sentry if in production
		if (error && import.meta.env.PROD) {
			// Sentry.captureException(error, {
			// 	tags: {
			// 		context: this.context,
			// 		requestId: this.requestId || 'unknown'
			// 	},
			// 	user: this.userId ? { id: this.userId } : undefined,
			// 	contexts: {
			// 		metadata: metadata || {}
			// 	}
			// });
		}
	}

	/**
	 * Internal log method
	 */
	private log(level: LogLevel, message: string, metadata?: Metadata, error?: unknown): void {
		if (isProduction) {
			// Production: output structured JSON logs
			this.logJson(level, message, metadata, error);
		} else {
			// Development: output pretty console logs
			this.logConsole(level, message, metadata, error);
		}
	}

	/**
	 * Log structured JSON for production (Vercel, log aggregators)
	 */
	private logJson(level: LogLevel, message: string, metadata?: Metadata, error?: unknown): void {
		const logObject: Record<string, unknown> = {
			timestamp: new Date().toISOString(),
			level,
			context: this.context,
			message: message.replace(/[┌├└✓✗⚠·→│]/g, '').trim(), // Strip symbols
			requestId: this.requestId,
			userId: this.userId,
			...this.metadata,
			...metadata
		};

		// Add error details if present
		if (error) {
			logObject.error = {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Error'
			};
		}

		// Use appropriate console method
		switch (level) {
			case 'debug':
			case 'info':
				console.log(JSON.stringify(logObject));
				break;
			case 'warn':
				console.warn(JSON.stringify(logObject));
				break;
			case 'error':
				console.error(JSON.stringify(logObject));
				break;
		}
	}

	/**
	 * Log pretty console output for development
	 */
	private logConsole(level: LogLevel, message: string, metadata?: Metadata, error?: unknown): void {
		const prefix = this.buildPrefix();

		// Format for console - cleaner, span-like output
		const consoleMessage = `${prefix}${message}${this.formatMetadata(metadata)}`;

		// Log based on level
		switch (level) {
			case 'debug':
			case 'info':
				console.log(consoleMessage);
				break;
			case 'warn':
				console.warn(consoleMessage);
				break;
			case 'error':
				console.error(consoleMessage);
				if (error) {
					// Show error details indented
					const errorMessage = error instanceof Error ? error.message : String(error);
					const errorStack = error instanceof Error ? error.stack : undefined;
					console.error(`    ↳ ${errorMessage}`);
					if (errorStack && process.env.NODE_ENV !== 'production') {
						// Only show stack in development
						console.error('    ' + errorStack.split('\n').slice(1, 4).join('\n    '));
					}
				}
				break;
		}
	}

	/**
	 * Build log prefix with context and IDs
	 */
	private buildPrefix(): string {
		// Clean, minimal prefix
		const contextShort = this.context.slice(0, 20).padEnd(20);
		const reqId = this.requestId ? this.requestId.slice(0, 8) : '--------';

		return `${contextShort} ${reqId} │ `;
	}

	/**
	 * Format metadata for console output - inline, minimal
	 */
	private formatMetadata(metadata?: Metadata): string {
		if (!metadata || Object.keys(metadata).length === 0) {
			return '';
		}

		// Only show 3 most important metadata items inline
		const entries = Object.entries(metadata).slice(0, 3);
		const formatted = entries.map(([key, value]) => `${key}=${this.formatValue(value)}`).join(', ');

		return formatted ? ` · ${formatted}` : '';
	}

	/**
	 * Format a single value for display
	 */
	private formatValue(value: unknown): string {
		if (typeof value === 'string') return value;
		if (typeof value === 'number') return value.toString();
		if (typeof value === 'boolean') return value.toString();
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';
		return JSON.stringify(value);
	}

	/**
	 * Flatten metadata for OpenTelemetry attributes
	 */
	private flattenMetadata(metadata?: Metadata): Record<string, string | number | boolean> {
		if (!metadata) return {};

		const flattened: Record<string, string | number | boolean> = {};

		for (const [key, value] of Object.entries(metadata)) {
			if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
				flattened[key] = value;
			} else {
				flattened[key] = JSON.stringify(value);
			}
		}

		return flattened;
	}
}

export class OperationLogger {
	constructor(
		private logger: Logger,
		private operation: string,
		private span: Span,
		private startTime: number
	) {}

	/**
	 * Log a step in this operation
	 */
	step(message: string, metadata?: Metadata): void {
		this.logger.step(message, metadata);
		this.span.addEvent(message, this.logger['flattenMetadata'](metadata));
	}

	/**
	 * Complete operation successfully
	 */
	end(metadata?: Metadata): void {
		const duration = performance.now() - this.startTime;

		this.span.setStatus({ code: SpanStatusCode.OK });
		this.span.setAttribute('duration.ms', duration);
		this.span.end();

		// Clean end format with timing
		const durationStr = `${duration.toFixed(0)}ms`;
		const metaStr =
			metadata && Object.keys(metadata).length > 0
				? ` · ${Object.entries(metadata)
						.slice(0, 2)
						.map(([k, v]) => `${k}=${v}`)
						.join(', ')}`
				: '';

		this.logger['log'](
			'info',
			`${SYMBOLS.end} ${this.operation} ${SYMBOLS.success} ${durationStr}${metaStr}`,
			undefined
		);
	}

	/**
	 * Complete operation with error
	 */
	error(message: string, error?: unknown, metadata?: Metadata): void {
		const duration = performance.now() - this.startTime;

		this.span.setStatus({
			code: SpanStatusCode.ERROR,
			message: message
		});
		this.span.setAttribute('duration.ms', duration);
		this.span.recordException(error as Error);
		this.span.end();

		// Clean error format with timing
		const durationStr = `${duration.toFixed(0)}ms`;
		this.logger['log'](
			'error',
			`${SYMBOLS.end} ${this.operation} ${SYMBOLS.error} ${durationStr}`,
			metadata,
			error
		);
	}

	/**
	 * Get the underlying logger for additional logging
	 */
	getLogger(): Logger {
		return this.logger;
	}
}

export function createLogger(context: string, options?: Partial<LoggerOptions>): Logger {
	return new Logger({
		context,
		requestId: options?.requestId,
		userId: options?.userId,
		metadata: options?.metadata
	});
}

export function getRequestId(): string | undefined {
	return AsyncContext.get<string>('requestId');
}

export function setRequestId(requestId: string): void {
	AsyncContext.set('requestId', requestId);
}

export function getUserId(): string | undefined {
	return AsyncContext.get<string>('userId');
}

export function setUserId(userId: string): void {
	AsyncContext.set('userId', userId);
}

export function createContextLogger(context: string, metadata?: Metadata): Logger {
	return new Logger({
		context,
		requestId: getRequestId(),
		userId: getUserId(),
		metadata
	});
}
