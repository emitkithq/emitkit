import type { LanguageModelMiddleware } from 'ai';
import { simulateReadableStream } from 'ai';
import { createLogger } from '$lib/server/logger';

// In-memory cache for development
// For production, consider using Redis or another persistent cache
const cache = new Map<string, any>();

const logger = createLogger('ai-cache');

export const cacheMiddleware: LanguageModelMiddleware = {
	wrapGenerate: async ({ doGenerate, params }) => {
		const cacheKey = JSON.stringify(params);

		// Check if result is cached
		const cached = cache.get(cacheKey);
		if (cached !== undefined) {
			logger.info('Cache hit for generateText', { cacheSize: cache.size });
			return {
				...cached,
				response: {
					...cached.response,
					timestamp: cached?.response?.timestamp ? new Date(cached.response.timestamp) : undefined
				}
			};
		}

		// If not cached, generate and store
		logger.info('Cache miss for generateText', { cacheSize: cache.size });
		const result = await doGenerate();
		cache.set(cacheKey, result);

		return result;
	},

	wrapStream: async ({ doStream, params }) => {
		const cacheKey = JSON.stringify(params);

		// Check if result is cached
		const cached = cache.get(cacheKey);
		if (cached !== undefined) {
			logger.info('Cache hit for streamText', { cacheSize: cache.size });
			// Format timestamps in cached response
			const formattedChunks = (cached as any[]).map((p: any) => {
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

		const fullResponse: any[] = [];

		const transformStream = new TransformStream({
			transform(chunk, controller) {
				fullResponse.push(chunk);
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
