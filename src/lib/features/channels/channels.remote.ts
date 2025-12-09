import { z } from 'zod';
import { command, form, query } from '$app/server';
import { paginationParamsSchema } from '$lib/server/db/utils';
import {
	createChannel,
	deleteChannel,
	getChannelByIdAndOrg,
	listChannels
} from '$lib/features/channels/server/repository';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, wrapLanguageModel } from 'ai';
import { OPENROUTER_API_KEY } from '$env/static/private';
import { cacheMiddleware } from '$lib/server/ai/middleware.js';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('channels-emoji');

const listChannelsSchema = paginationParamsSchema.extend({
	organizationId: z.string()
});

export const listChannelsQuery = query(listChannelsSchema, async (input) => {
	return await listChannels(input.organizationId, {
		page: input.page,
		limit: input.limit
	});
});

const listChannelsByFolderSchema = paginationParamsSchema.extend({
	projectId: z.string()
});

export const listChannelsByFolderQuery = query(listChannelsByFolderSchema, async (input) => {
	const { listChannelsByFolder } = await import('./server/repository');
	return await listChannelsByFolder(input.projectId, {
		page: input.page,
		limit: input.limit
	});
});

const createChannelSchema = z.object({
	projectId: z.string(),
	organizationId: z.string(),
	name: z.string().min(3).max(255),
	icon: z.string().optional(),
	description: z.string().optional()
});

export const createChannelCommand = command(createChannelSchema, async (input) => {
	return await createChannel({
		projectId: input.projectId,
		organizationId: input.organizationId,
		name: input.name,
		icon: input.icon,
		description: input.description
	});
});

export const createChannelForm = form(createChannelSchema, async (input) => {
	return await createChannel({
		projectId: input.projectId,
		organizationId: input.organizationId,
		name: input.name,
		icon: input.icon,
		description: input.description
	});
});

const deleteChannelSchema = z.object({
	channelId: z.string(),
	organizationId: z.string()
});

export const deleteChannelCommand = command(deleteChannelSchema, async (input) => {
	// Verify channel belongs to organization
	const channel = await getChannelByIdAndOrg(input.channelId, input.organizationId);
	if (!channel) {
		throw new Error('Channel not found or access denied');
	}

	await deleteChannel(input.channelId);
});

const suggestEmojiSchema = z.object({
	channelName: z.string().min(1)
});

export const suggestEmojiCommand = command(suggestEmojiSchema, async (input) => {
	try {
		const openrouter = createOpenRouter({
			apiKey: OPENROUTER_API_KEY
		});

		// Wrap the model with caching middleware to avoid repeated API calls
		const cachedModel = wrapLanguageModel({
			model: openrouter.chat('google/gemini-2.5-flash-lite'),
			middleware: cacheMiddleware
		});

		// Use google/gemini-2.5-flash-lite - cheap and fast ($0.1 per 1M tokens)
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

		// Extract the emoji from the response (trim whitespace and newlines)
		const emoji = text.trim();

		// Validate that we got a reasonable emoji response (should be 1-4 characters for multi-byte emojis)
		if (!emoji || emoji.length > 10 || emoji.length === 0) {
			throw new Error('Invalid emoji response');
		}

		return { emoji };
	} catch (error) {
		// Log error for debugging but don't expose to user
		logger.error('Failed to suggest emoji', error instanceof Error ? error : undefined, {
			channelName: input.channelName
		});
		// Return a sensible default based on common patterns
		const name = input.channelName.toLowerCase();
		if (name.includes('announce')) return { emoji: '📢' };
		if (name.includes('support') || name.includes('help')) return { emoji: '🆘' };
		if (name.includes('dev') || name.includes('code')) return { emoji: '💻' };
		if (name.includes('design')) return { emoji: '🎨' };
		if (name.includes('random') || name.includes('fun')) return { emoji: '🎲' };
		if (name.includes('bug') || name.includes('issue')) return { emoji: '🐛' };
		// Ultimate fallback
		return { emoji: '💬' };
	}
});
