import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { event } from './event';

export type Event = InferSelectModel<typeof event>;
export type EventInsert = InferInsertModel<typeof event>;
