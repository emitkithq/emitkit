import { db } from '$lib/server/db';
import { schema } from '$lib/server/db';
import type { PaginationParams, PaginatedQueryResult } from '$lib/server/db/utils';
import { buildPaginatedQuery } from '$lib/server/db/utils';
import { and, eq, sql } from 'drizzle-orm';
import type {
	Funnel,
	FunnelInsert,
	FunnelUpdate,
	FunnelStep,
	FunnelStepInsert,
	FunnelProgress,
	FunnelProgressInsert
} from '../types';

// =============================================================================
// Funnel Operations
// =============================================================================

export async function createFunnel(funnel: FunnelInsert): Promise<Funnel> {
	const now = new Date();

	const [created] = await db
		.insert(schema.funnel)
		.values({
			...funnel,
			createdAt: funnel.createdAt ?? now,
			updatedAt: funnel.updatedAt ?? now
		})
		.returning();

	if (!created) {
		throw new Error('Failed to create funnel');
	}

	return created;
}

export async function getFunnel(id: string, orgId: string): Promise<Funnel | null> {
	const result = await db.query.funnel.findFirst({
		where: and(eq(schema.funnel.id, id), eq(schema.funnel.organizationId, orgId))
	});

	return result ?? null;
}

export async function listFunnels(
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<Funnel>> {
	const page = pagination?.page ?? 1;
	const limit = pagination?.limit ?? 20;
	const offset = (page - 1) * limit;

	const query = db.query.funnel.findMany({
		where: eq(schema.funnel.organizationId, orgId),
		orderBy: (funnels, { desc }) => [desc(funnels.createdAt)],
		limit,
		offset
	});

	const countQuery = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.funnel)
		.where(eq(schema.funnel.organizationId, orgId));

	return buildPaginatedQuery(query, countQuery, { page, limit });
}

export async function updateFunnel(id: string, updates: FunnelUpdate): Promise<Funnel> {
	const now = new Date();

	const [updated] = await db
		.update(schema.funnel)
		.set({
			...updates,
			updatedAt: now
		})
		.where(eq(schema.funnel.id, id))
		.returning();

	if (!updated) {
		throw new Error('Failed to update funnel');
	}

	return updated;
}

export async function deleteFunnel(id: string): Promise<void> {
	await db.delete(schema.funnel).where(eq(schema.funnel.id, id));
}

// =============================================================================
// Funnel Step Operations
// =============================================================================

export async function createStep(step: FunnelStepInsert): Promise<FunnelStep> {
	const now = new Date();

	const [created] = await db
		.insert(schema.funnelStep)
		.values({
			...step,
			createdAt: step.createdAt ?? now
		})
		.returning();

	if (!created) {
		throw new Error('Failed to create funnel step');
	}

	return created;
}

export async function getStepsByFunnel(funnelId: string, orgId: string): Promise<FunnelStep[]> {
	// Verify funnel belongs to organization
	const [funnelCheck] = await db
		.select()
		.from(schema.funnel)
		.where(and(eq(schema.funnel.id, funnelId), eq(schema.funnel.organizationId, orgId)))
		.limit(1);

	if (!funnelCheck) {
		return [];
	}

	const results = await db.query.funnelStep.findMany({
		where: eq(schema.funnelStep.funnelId, funnelId),
		orderBy: (steps, { asc }) => [asc(steps.stepOrder)]
	});

	return results;
}

export async function deleteStep(id: string): Promise<void> {
	await db.delete(schema.funnelStep).where(eq(schema.funnelStep.id, id));
}

// =============================================================================
// Funnel Progress Operations
// =============================================================================

export async function upsertProgress(progress: FunnelProgressInsert): Promise<FunnelProgress> {
	const now = new Date();

	const [upserted] = await db
		.insert(schema.funnelProgress)
		.values({
			...progress,
			startedAt: progress.startedAt ?? now,
			updatedAt: progress.updatedAt ?? now
		})
		.onConflictDoUpdate({
			target: [schema.funnelProgress.funnelId, schema.funnelProgress.userId],
			set: {
				currentStep: progress.currentStep,
				completed: progress.completed,
				completedAt: progress.completedAt,
				updatedAt: now
			}
		})
		.returning();

	if (!upserted) {
		throw new Error('Failed to upsert funnel progress');
	}

	return upserted;
}

export async function getProgress(
	funnelId: string,
	userId: string,
	orgId: string
): Promise<FunnelProgress | null> {
	const result = await db.query.funnelProgress.findFirst({
		where: and(
			eq(schema.funnelProgress.funnelId, funnelId),
			eq(schema.funnelProgress.userId, userId),
			eq(schema.funnelProgress.organizationId, orgId)
		)
	});

	return result ?? null;
}

export async function listProgress(
	funnelId: string,
	orgId: string,
	pagination?: PaginationParams
): Promise<PaginatedQueryResult<FunnelProgress>> {
	const page = pagination?.page ?? 1;
	const limit = pagination?.limit ?? 20;
	const offset = (page - 1) * limit;

	// Verify funnel belongs to organization
	const [funnelCheck] = await db
		.select()
		.from(schema.funnel)
		.where(and(eq(schema.funnel.id, funnelId), eq(schema.funnel.organizationId, orgId)))
		.limit(1);

	if (!funnelCheck) {
		return {
			items: [],
			metadata: {
				page,
				limit,
				total: 0,
				totalPages: 0,
				hasNextPage: false,
				hasPreviousPage: false
			}
		};
	}

	const query = db.query.funnelProgress.findMany({
		where: eq(schema.funnelProgress.funnelId, funnelId),
		orderBy: (progress, { desc }) => [desc(progress.updatedAt)],
		limit,
		offset
	});

	const countQuery = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.funnelProgress)
		.where(eq(schema.funnelProgress.funnelId, funnelId));

	return buildPaginatedQuery(query, countQuery, { page, limit });
}

export async function advanceStep(progressId: string, stepOrder: number): Promise<FunnelProgress> {
	const now = new Date();

	const [updated] = await db
		.update(schema.funnelProgress)
		.set({
			currentStep: stepOrder,
			updatedAt: now
		})
		.where(eq(schema.funnelProgress.id, progressId))
		.returning();

	if (!updated) {
		throw new Error('Failed to advance funnel step');
	}

	return updated;
}

export async function markCompleted(progressId: string): Promise<FunnelProgress> {
	const now = new Date();

	const [updated] = await db
		.update(schema.funnelProgress)
		.set({
			completed: true,
			completedAt: now,
			updatedAt: now
		})
		.where(eq(schema.funnelProgress.id, progressId))
		.returning();

	if (!updated) {
		throw new Error('Failed to mark funnel as completed');
	}

	return updated;
}
