import { siteConfig } from './site-config';
import { createContextLogger } from './logger';
import { workflowClient } from './upstash-workflow';

const logger = createContextLogger('workflow-trigger');

/**
 * Trigger a workflow via QStash.
 * This properly sends the workflow trigger through QStash, which then calls
 * the workflow endpoint with proper signatures for verification.
 *
 * @param path - Workflow endpoint path (e.g., '/api/workflows/events')
 * @param payload - Workflow payload
 * @returns Promise resolving to { workflowRunId: string }
 *
 * @example
 * ```typescript
 * const { workflowRunId } = await triggerWorkflow('/api/workflows/events', {
 *   eventId: 'evt_123',
 *   channelId: 'ch_123',
 *   organizationId: 'org_123',
 *   notify: true
 * });
 * ```
 */
export async function triggerWorkflow<T>(
	path: string,
	payload: T
): Promise<{ workflowRunId: string }> {
	// Remove leading slash from path to avoid double slashes in URL
	const cleanPath = path.startsWith('/') ? path.slice(1) : path;
	const url = `${siteConfig.appUrl}/${cleanPath}`;

	logger.info('Triggering workflow', { url, path: cleanPath });

	try {
		// Use Upstash Workflow Client to trigger
		// QStash will then call our endpoint with proper signatures
		const result = await workflowClient.trigger({
			url,
			body: payload
		});

		logger.info('Workflow triggered successfully', {
			workflowRunId: result.workflowRunId
		});

		return { workflowRunId: result.workflowRunId };
	} catch (error) {
		logger.error('Failed to trigger workflow', error instanceof Error ? error : undefined, {
			url,
			error: error instanceof Error ? error.message : 'Unknown error'
		});
		throw error;
	}
}
