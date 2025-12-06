import { createContextLogger } from '$lib/server/logger';

const logger = createContextLogger('slack-api');

const SLACK_API_BASE = 'https://slack.com/api';

export type SlackChannel = {
	id: string;
	name: string;
	is_private: boolean;
	is_archived: boolean;
};

export type SlackAuthTestResponse = {
	ok: boolean;
	url?: string;
	team?: string;
	user?: string;
	team_id?: string;
	user_id?: string;
	bot_id?: string;
	error?: string;
};

export type SlackConversationsListResponse = {
	ok: boolean;
	channels?: SlackChannel[];
	error?: string;
};

export type SlackPostMessageResponse = {
	ok: boolean;
	channel?: string;
	ts?: string;
	message?: any;
	error?: string;
};

/**
 * Verify a Slack bot token and get workspace information
 */
export async function verifyBotToken(token: string): Promise<{
	valid: boolean;
	workspace?: string;
	workspaceId?: string;
	error?: string;
}> {
	try {
		const response = await fetch(`${SLACK_API_BASE}/auth.test`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			signal: AbortSignal.timeout(10000)
		});

		const data: SlackAuthTestResponse = await response.json();

		if (data.ok) {
			logger.success('Slack bot token verified', {
				workspace: data.team,
				workspaceId: data.team_id
			});

			return {
				valid: true,
				workspace: data.team,
				workspaceId: data.team_id
			};
		} else {
			logger.warn('Slack bot token verification failed', { error: data.error });
			return {
				valid: false,
				error: data.error || 'Token verification failed'
			};
		}
	} catch (error) {
		logger.error('Slack bot token verification error', error as Error);
		return {
			valid: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * List all channels accessible to the bot
 */
export async function listChannels(token: string): Promise<{
	channels: SlackChannel[];
	error?: string;
}> {
	try {
		// Fetch both public and private channels the bot has access to
		const response = await fetch(
			`${SLACK_API_BASE}/conversations.list?exclude_archived=true&types=public_channel,private_channel&limit=200`,
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				signal: AbortSignal.timeout(10000)
			}
		);

		const data: SlackConversationsListResponse = await response.json();

		if (data.ok && data.channels) {
			logger.info('Slack channels fetched', { count: data.channels.length });
			return {
				channels: data.channels.filter((ch) => !ch.is_archived)
			};
		} else {
			logger.warn('Failed to fetch Slack channels', { error: data.error });
			return {
				channels: [],
				error: data.error || 'Failed to fetch channels'
			};
		}
	} catch (error) {
		logger.error('Error fetching Slack channels', error as Error);
		return {
			channels: [],
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Post a message to a Slack channel using bot token
 */
export async function postMessage(
	token: string,
	channelId: string,
	message: {
		text: string;
		blocks?: any[];
	}
): Promise<{
	success: boolean;
	error?: string;
	timestamp?: string;
}> {
	try {
		const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				channel: channelId,
				text: message.text,
				blocks: message.blocks
			}),
			signal: AbortSignal.timeout(10000)
		});

		const data: SlackPostMessageResponse = await response.json();

		if (data.ok) {
			logger.success('Slack message posted', {
				channel: channelId,
				timestamp: data.ts
			});
			return {
				success: true,
				timestamp: data.ts
			};
		} else {
			logger.warn('Failed to post Slack message', { error: data.error });
			return {
				success: false,
				error: data.error || 'Failed to post message'
			};
		}
	} catch (error) {
		logger.error('Error posting Slack message', error as Error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}
