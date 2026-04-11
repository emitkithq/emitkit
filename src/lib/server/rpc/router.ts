import { channelsRouter } from '$lib/features/channels/server/router';
import { eventsRouter } from '$lib/features/events/server/router';
import { projectsRouter } from '$lib/features/projects/server/router';
import { notificationsRouter } from '$lib/features/notifications/server/router';

export const router = {
	channels: channelsRouter,
	events: eventsRouter,
	projects: projectsRouter,
	notifications: notificationsRouter
};

export type AppRouter = typeof router;
