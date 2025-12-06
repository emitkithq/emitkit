import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyBotToken } from '$lib/features/integrations/server/slack-api';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { botToken } = await request.json();

		if (!botToken || typeof botToken !== 'string') {
			return json({ valid: false, error: 'Bot token is required' }, { status: 400 });
		}

		const result = await verifyBotToken(botToken);

		return json(result);
	} catch (error) {
		return json(
			{
				valid: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
