import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { funnel, funnelStep, funnelProgress } from '$lib/server/db/schema';

export type {
	Funnel,
	FunnelInsert,
	FunnelUpdate,
	FunnelStep,
	FunnelStepInsert,
	FunnelProgress,
	FunnelProgressInsert
} from '$lib/server/db/schema';

export const selectFunnelSchema = createSelectSchema(funnel);
export const insertFunnelSchema = createInsertSchema(funnel);

export const selectFunnelStepSchema = createSelectSchema(funnelStep);
export const insertFunnelStepSchema = createInsertSchema(funnelStep);

export const selectFunnelProgressSchema = createSelectSchema(funnelProgress);
export const insertFunnelProgressSchema = createInsertSchema(funnelProgress);
