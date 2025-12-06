import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listChannels } from '$lib/features/integrations/server/slack-api';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { botToken } = await request.json();

		if (!botToken || typeof botToken !== 'string') {
			return json({ channels: [], error: 'Bot token is required' }, { status: 400 });
		}

		const result = await listChannels(botToken);

		return json(result);
	} catch (error) {
		return json(
			{
				channels: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
