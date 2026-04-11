import { z } from 'zod';
import { base, middleware } from '$lib/server/rpc';
import { paginationParamsSchema } from '$lib/server/db/utils';
import {
	createChannel,
	deleteChannel,
	getChannelByIdAndOrg,
	listChannels,
	listChannelsByFolder
} from '$lib/features/channels/server/repository';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, wrapLanguageModel } from 'ai';
import { OPENROUTER_API_KEY } from '$env/static/private';
import { cacheMiddleware } from '$lib/server/ai/middleware.js';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('channels-emoji');

const authed = base.use(middleware.auth);

const list = authed
	.input(
		paginationParamsSchema.extend({
			organizationId: z.string()
		})
	)
	.handler(async ({ input }) => {
		return await listChannels(input.organizationId, {
			page: input.page,
			limit: input.limit
		});
	});

const listByFolder = authed
	.input(
		paginationParamsSchema.extend({
			projectId: z.string()
		})
	)
	.handler(async ({ input }) => {
		return await listChannelsByFolder(input.projectId, {
			page: input.page,
			limit: input.limit
		});
	});

const create = authed
	.input(
		z.object({
			projectId: z.string(),
			organizationId: z.string(),
			name: z.string().min(3).max(255),
			icon: z.string().optional(),
			description: z.string().optional()
		})
	)
	.handler(async ({ input }) => {
		return await createChannel({
			projectId: input.projectId,
			organizationId: input.organizationId,
			name: input.name,
			icon: input.icon,
			description: input.description
		});
	});

const remove = authed
	.input(
		z.object({
			channelId: z.string(),
			organizationId: z.string()
		})
	)
	.handler(async ({ input }) => {
		const channel = await getChannelByIdAndOrg(input.channelId, input.organizationId);
		if (!channel) {
			throw new Error('Channel not found or access denied');
		}
		await deleteChannel(input.channelId);
	});

const suggestEmoji = authed
	.input(
		z.object({
			channelName: z.string().min(1)
		})
	)
	.handler(async ({ input }) => {
		try {
			const openrouter = createOpenRouter({
				apiKey: OPENROUTER_API_KEY
			});

			const cachedModel = wrapLanguageModel({
				model: openrouter.chat('google/gemini-2.5-flash-lite'),
				middleware: cacheMiddleware
			});

			const { text } = await generateText({
				model: cachedModel,
				prompt: `Given the channel name "${input.channelName}", suggest a single appropriate emoji that best represents this channel.

Examples:
- "announcements" → 📢
- "general" → 💬
- "support" → 🆘
- "random" → 🎲
- "development" → 💻
- "design" → 🎨
- "marketing" → 📈
- "customer-escalations" → 🚨
- "payroll-questions" → 💰
- "infrastructure-alerts" → ⚠️

Return ONLY a single emoji character that best fits "${input.channelName}". Do not include any other text, just the emoji.`
			});

			const emoji = text.trim();

			if (!emoji || emoji.length > 10 || emoji.length === 0) {
				throw new Error('Invalid emoji response');
			}

			return { emoji };
		} catch (error) {
			logger.error('Failed to suggest emoji', error instanceof Error ? error : undefined, {
				channelName: input.channelName
			});
			const name = input.channelName.toLowerCase();
			if (name.includes('announce')) return { emoji: '📢' };
			if (name.includes('support') || name.includes('help')) return { emoji: '🆘' };
			if (name.includes('dev') || name.includes('code')) return { emoji: '💻' };
			if (name.includes('design')) return { emoji: '🎨' };
			if (name.includes('random') || name.includes('fun')) return { emoji: '🎲' };
			if (name.includes('bug') || name.includes('issue')) return { emoji: '🐛' };
			return { emoji: '💬' };
		}
	});

export const channelsRouter = {
	list,
	listByFolder,
	create,
	delete: remove,
	suggestEmoji
};
