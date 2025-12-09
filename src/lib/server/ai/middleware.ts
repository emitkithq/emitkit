import type { LanguageModelMiddleware } from 'ai';
import { simulateReadableStream } from 'ai';
import { createLogger } from '$lib/server/logger';

// Type for AI SDK generate result with serializable response
type CachedGenerateResult = {
	content: unknown[];
	finishReason: string;
	usage: unknown;
	response?: {
		timestamp?: string | Date;
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

// In-memory cache for development
// For production, consider using Redis or another persistent cache
const cache = new Map<string, CachedGenerateResult | unknown[]>();

const logger = createLogger('ai-cache');

export const cacheMiddleware: LanguageModelMiddleware = {
	wrapGenerate: async ({ doGenerate, params }) => {
		const cacheKey = JSON.stringify(params);

		// Check if result is cached
		const cached = cache.get(cacheKey);
		if (cached !== undefined && !Array.isArray(cached)) {
			logger.info('Cache hit for generateText', { cacheSize: cache.size });
			const cachedResult = cached as CachedGenerateResult;
			// Restore timestamp if it was serialized
			const result = {
				...cachedResult,
				response: cachedResult.response
					? {
							...cachedResult.response,
							timestamp:
								cachedResult.response.timestamp &&
								typeof cachedResult.response.timestamp === 'string'
									? new Date(cachedResult.response.timestamp)
									: cachedResult.response.timestamp
						}
					: undefined
			};
			// Type assertion needed because cache loses exact AI SDK types during serialization
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK internal types are complex and preserved at runtime
			return result as any;
		}

		// If not cached, generate and store
		logger.info('Cache miss for generateText', { cacheSize: cache.size });
		const result = await doGenerate();
		cache.set(cacheKey, result as CachedGenerateResult);

		return result;
	},

	wrapStream: async ({ doStream, params }) => {
		const cacheKey = JSON.stringify(params);

		// Type for cached stream chunks from AI SDK
		type StreamChunk = {
			type?: string;
			timestamp?: string | Date;
			[key: string]: unknown;
		};

		// Check if result is cached
		const cached = cache.get(cacheKey);
		if (cached !== undefined) {
			logger.info('Cache hit for streamText', { cacheSize: cache.size });
			// Format timestamps in cached response
			const cachedChunks = cached as StreamChunk[];
			const formattedChunks = cachedChunks.map((p) => {
				if (p.type === 'response-metadata' && p.timestamp) {
					return { ...p, timestamp: new Date(p.timestamp) };
				}
				return p;
			});

			return {
				stream: simulateReadableStream({
					initialDelayInMs: 0,
					chunkDelayInMs: 10,
					chunks: formattedChunks
				})
			};
		}

		// If not cached, stream and store
		logger.info('Cache miss for streamText', { cacheSize: cache.size });
		const { stream, ...rest } = await doStream();

		const fullResponse: StreamChunk[] = [];

		const transformStream = new TransformStream({
			transform(chunk, controller) {
				fullResponse.push(chunk as StreamChunk);
				controller.enqueue(chunk);
			},
			flush() {
				// Store the full response in cache after streaming is complete
				cache.set(cacheKey, fullResponse);
			}
		});

		return {
			stream: stream.pipeThrough(transformStream),
			...rest
		};
	}
};
