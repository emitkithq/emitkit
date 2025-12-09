import { type Column, getTableColumns, type SQL, sql } from 'drizzle-orm';
import type { PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { z } from 'zod';

// ============================================================================
// Conflict Resolution Utilities
// ============================================================================

export function conflictUpdateSetAllColumns<TTable extends PgTable>(
	table: TTable
): PgUpdateSetSource<TTable> {
	const columns = getTableColumns(table);
	const { name: tableName } = getTableConfig(table);
	const conflictUpdateSet = Object.entries(columns).reduce(
		(acc: Record<string, SQL>, [columnName, columnInfo]) => {
			if (!columnInfo.default) {
				acc[columnName] = sql.raw(
					`COALESCE(excluded.${columnInfo.name}, ${tableName}.${columnInfo.name})`
				);
			}
			return acc;
		},
		{}
	) as PgUpdateSetSource<TTable>;
	return conflictUpdateSet;
}

export function conflictUpdateSet<TTable extends PgTable>(
	table: TTable,
	columns: (keyof TTable['_']['columns'] & keyof TTable)[]
): PgUpdateSetSource<TTable> {
	return Object.assign(
		{},
		...columns.map((k) => ({
			[k]: sql.raw(`excluded.${(table[k] as Column).name}`)
		}))
	) as PgUpdateSetSource<TTable>;
}

// ============================================================================
// Pagination Utilities
// ============================================================================

export const DEFAULT_PAGE_SIZE = 20;

export const paginationParamsSchema = z.object({
	page: z.number().int().positive().default(1).optional(),
	limit: z.number().int().positive().max(100).default(20).optional()
});

export type PaginationParams = z.infer<typeof paginationParamsSchema>;

export type PaginatedQueryResult<T> = {
	/** Array of items for the current page */
	items: T[];
	/** Pagination metadata */
	metadata: {
		/** Total number of items across all pages */
		total: number;
		/** Current page number */
		page: number;
		/** Number of items per page */
		limit: number;
		/** Total number of pages */
		totalPages: number;
		/** Whether there is a next page */
		hasNextPage: boolean;
		/** Whether there is a previous page */
		hasPreviousPage: boolean;
	};
};

export async function buildPaginatedQuery<T>(
	query: { execute: () => Promise<T[]> },
	countQuery: { execute: () => Promise<Array<{ count: number | string }>> },
	{ page = 1, limit = DEFAULT_PAGE_SIZE }: PaginationParams = {}
): Promise<PaginatedQueryResult<T>> {
	const [items, [countResult]] = await Promise.all([query.execute(), countQuery.execute()]);

	const totalCount = Number(countResult?.count ?? 0);
	const totalPages = Math.ceil(totalCount / limit);

	return {
		items,
		metadata: {
			total: totalCount,
			page,
			limit,
			totalPages,
			hasNextPage: page < totalPages,
			hasPreviousPage: page > 1
		}
	};
}
