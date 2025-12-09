import { waitUntil as vercelWaitUntil } from '@vercel/functions';
import { createLogger } from './logger';

const logger = createLogger('wait-until');

/**
 * Execute background tasks that should continue after the response is sent.
 *
 * Re-export of @vercel/functions waitUntil() with error handling.
 * The package automatically detects the runtime context and handles
 * both Vercel production and local development appropriately.
 *
 * Usage:
 * ```typescript
 * import { waitUntil } from '$lib/server/wait-until';
 *
 * export async function POST({ request }: RequestEvent) {
 *   const data = await request.json();
 *   const result = await createEvent(data);
 *
 *   // Schedule background tasks
 *   waitUntil(
 *     Promise.all([
 *       invalidateCache(result.id),
 *       sendNotification(result.id)
 *     ])
 *   );
 *
 *   return json(result);
 * }
 * ```
 *
 * @param promise - Promise to execute in the background
 */
export function waitUntil(promise: Promise<unknown>): void {
	vercelWaitUntil(
		promise.catch((error) => {
			logger.error('Background task failed', error instanceof Error ? error : undefined);
		})
	);
}
