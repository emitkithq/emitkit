import { db } from '$lib/server/db';
import { project, organization, apikey, channel } from '$lib/server/db/schema';
import { and, sql } from 'drizzle-orm';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('project-cleanup-job');

/**
 * Cleanup job to permanently delete projects that have been soft-deleted
 * beyond the organization's retention period.
 *
 * This job should be run periodically (e.g., daily) to clean up old archived projects.
 *
 * Retention policies:
 * - basic: 90 days
 * - premium: 365 days
 * - unlimited: never delete (no cleanup)
 */
export async function cleanupDeletedProjects(): Promise<{
	projectsDeleted: number;
	channelsDeleted: number;
	apiKeysDeleted: number;
}> {
	const operation = logger.start('Cleanup deleted projects job');

	try {
		// Calculate cutoff dates for each retention tier
		const now = new Date();
		const basicCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days
		const premiumCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 365 days

		operation.step('Finding projects eligible for deletion');

		// Find all soft-deleted projects that exceed their org's retention period
		// We need to join with organization to check retention_tier
		const eligibleFolders = await db
			.select({
				projectId: project.id,
				projectName: project.name,
				organizationId: project.organizationId,
				deletedAt: project.deletedAt,
				retentionTier: organization.retentionTier
			})
			.from(project)
			.innerJoin(organization, sql`${project.organizationId} = ${organization.id}`)
			.where(
				and(
					sql`${project.deletedAt} IS NOT NULL`,
					sql`(
						(${organization.retentionTier} = 'basic' AND ${project.deletedAt} < ${basicCutoff})
						OR
						(${organization.retentionTier} = 'premium' AND ${project.deletedAt} < ${premiumCutoff})
					)`
				)
			);

		if (eligibleFolders.length === 0) {
			operation.end({ projectsDeleted: 0, channelsDeleted: 0, apiKeysDeleted: 0 });
			logger.info('No projects eligible for cleanup');
			return { projectsDeleted: 0, channelsDeleted: 0, apiKeysDeleted: 0 };
		}

		operation.step('Deleting associated data', {
			eligibleFoldersCount: eligibleFolders.length
		});

		let totalChannelsDeleted = 0;
		let totalApiKeysDeleted = 0;

		// Process each project
		for (const projectRecord of eligibleFolders) {
			const projectOperation = logger.start('Delete project permanently', {
				projectId: projectRecord.projectId,
				projectName: projectRecord.projectName,
				organizationId: projectRecord.organizationId,
				retentionTier: projectRecord.retentionTier
			});

			try {
				// Delete associated channels (cascade will handle webhooks)
				const deletedChannels = await db
					.delete(channel)
					.where(sql`${channel.projectId} = ${projectRecord.projectId}`)
					.returning();
				totalChannelsDeleted += deletedChannels.length;

				// Delete associated API keys
				const deletedApiKeys = await db
					.delete(apikey)
					.where(sql`${apikey.metadata}->>'projectId' = ${projectRecord.projectId}`)
					.returning();
				totalApiKeysDeleted += deletedApiKeys.length;

				// Finally, delete the project itself
				await db.delete(project).where(sql`${project.id} = ${projectRecord.projectId}`);

				projectOperation.end({
					channelsDeleted: deletedChannels.length,
					apiKeysDeleted: deletedApiKeys.length
				});
			} catch (error) {
				projectOperation.error(
					'Failed to delete project',
					error instanceof Error ? error : undefined,
					{
						projectId: projectRecord.projectId
					}
				);
				// Continue with next project even if one fails
			}
		}

		operation.end({
			projectsDeleted: eligibleFolders.length,
			channelsDeleted: totalChannelsDeleted,
			apiKeysDeleted: totalApiKeysDeleted
		});

		logger.success('Cleanup job completed', {
			projectsDeleted: eligibleFolders.length,
			channelsDeleted: totalChannelsDeleted,
			apiKeysDeleted: totalApiKeysDeleted
		});

		return {
			projectsDeleted: eligibleFolders.length,
			channelsDeleted: totalChannelsDeleted,
			apiKeysDeleted: totalApiKeysDeleted
		};
	} catch (error) {
		operation.error('Cleanup job failed', error instanceof Error ? error : undefined);
		throw error;
	}
}
