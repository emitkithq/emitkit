export type Event = {
	id: string;
	channelId: string;
	projectId: string;
	organizationId: string;
	title: string;
	description: string | null;
	icon: string | null;
	tags: string[];
	metadata: Record<string, unknown>;
	userId: string | null;
	notify: boolean;
	source: string;
	createdAt: Date;
};

export type EventInsert = {
	id?: string;
	channelId: string;
	projectId: string;
	organizationId: string;
	title: string;
	description?: string | null;
	icon?: string | null;
	tags?: string[];
	metadata?: Record<string, unknown>;
	userId?: string | null;
	notify?: boolean;
	source?: string;
	createdAt?: Date;
};
