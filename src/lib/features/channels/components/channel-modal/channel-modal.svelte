<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import { orpc, api } from '$lib/config/rpc-client';
	import { createMutation, useQueryClient } from '@tanstack/svelte-query';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as EmojiPicker from '$lib/components/ui/emoji-picker';
	import * as Popover from '$lib/components/ui/popover';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import SmilePlusIcon from '@lucide/svelte/icons/smile-plus';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';

	// Props interface
	interface Props {
		organizationId: string;
		projectId: string;
	}

	// Component props with StackItemProps for modal integration
	let {
		item,
		organizationId,
		projectId
	}: StackItemProps<{ success: boolean; channelId?: string }> & Props = $props();

	// Form state
	let name = $state('');
	let description = $state('');

	// Emoji picker state
	let selectedEmoji = $state<string>('');
	let emojiPickerOpen = $state(false);
	let emojiPickerMounted = $state(false);
	let isSuggestingEmoji = $state(false);
	const queryClient = useQueryClient();
	let errors = $state<Record<string, string>>({});

	// Mount emoji picker on first open to defer heavy initialization
	$effect(() => {
		if (emojiPickerOpen && !emojiPickerMounted) {
			emojiPickerMounted = true;
		}
	});

	// Handle AI emoji suggestion
	async function handleAISuggestion() {
		if (!name || name.trim() === '' || name.length < 3) {
			return;
		}

		isSuggestingEmoji = true;

		try {
			const result = await orpc.channels.suggestEmoji({ channelName: name.trim() });

			if (result && result.emoji) {
				selectedEmoji = result.emoji;
			}
		} catch (error) {
			console.error('Failed to suggest emoji:', error);
		} finally {
			isSuggestingEmoji = false;
		}
	}

	// Handle cancel
	function handleCancel() {
		item.resolve({ success: false });
	}

	const createChannelMut = createMutation(() =>
		api.channels.create.mutationOptions({
			onError: (err) => {
				errors.form = err.message || 'Failed to create channel';
			},
			onSettled: () => {
				queryClient.invalidateQueries({ queryKey: api.channels.listByOrg.key() });
			}
		})
	);

	const isSubmitting = $derived(createChannelMut.isPending);

	// Handle submit
	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errors = {};

		if (!name || name.trim().length < 3) {
			errors.name = 'Channel name must be at least 3 characters';
			return;
		}

		try {
			const channel = await createChannelMut.mutateAsync({
				projectId,
				organizationId,
				name: name.trim(),
				icon: selectedEmoji || undefined,
				description: description || undefined
			});

			item.resolve({
				success: true,
				channelId: channel.id
			});
		} catch {
			// Error handled by onError callback
		}
	}
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="sm:max-w-[500px]">
		<Dialog.Header>
			<Dialog.Title>Create New Channel</Dialog.Title>
			<Dialog.Description>
				Add a new channel to organize your content and conversations.
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={handleSubmit} class="space-y-6">
			<Field.Group>
				<!-- Channel Name with Emoji Picker -->
				<Field.Field data-invalid={!!errors.name}>
					<Field.Label for="channel-name">Channel Name *</Field.Label>
					<InputGroup.Root data-disabled={isSuggestingEmoji}>
						<!-- Emoji Picker Popover (Left) -->
						{#if emojiPickerMounted}
							<EmojiPicker.Root
								disableInitialScroll
								bind:value={selectedEmoji}
								onSelect={(selected) => {
									emojiPickerOpen = false;
									selectedEmoji = selected.emoji;
								}}
							>
								<Popover.Root bind:open={emojiPickerOpen}>
									<Popover.Trigger>
										{#snippet child({ props })}
											<InputGroup.Addon>
												<InputGroup.Button
													{...props}
													type="button"
													variant="secondary"
													size="icon-xs"
													disabled={isSuggestingEmoji}
												>
													{#if selectedEmoji}
														<span class="text-base">{selectedEmoji}</span>
													{:else}
														<SmilePlusIcon class="h-3 w-3" />
													{/if}
												</InputGroup.Button>
											</InputGroup.Addon>
										{/snippet}
									</Popover.Trigger>
									<Popover.Content class="w-auto p-0" align="start">
										<EmojiPicker.SearchDebounced />
										<EmojiPicker.ListLazy />
									</Popover.Content>
								</Popover.Root>
							</EmojiPicker.Root>
						{:else}
							<Popover.Root bind:open={emojiPickerOpen}>
								<Popover.Trigger>
									{#snippet child({ props })}
										<InputGroup.Addon>
											<InputGroup.Button
												{...props}
												type="button"
												variant="secondary"
												size="icon-xs"
												disabled={isSuggestingEmoji}
											>
												{#if selectedEmoji}
													<span class="text-base">{selectedEmoji}</span>
												{:else}
													<SmilePlusIcon class="h-3 w-3" />
												{/if}
											</InputGroup.Button>
										</InputGroup.Addon>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-auto p-0" align="start">
									<div class="flex items-center justify-center p-4">
										<Spinner class="h-4 w-4" />
									</div>
								</Popover.Content>
							</Popover.Root>
						{/if}

						<!-- Channel Name Input (Center) -->
						<InputGroup.Input
							id="channel-name"
							placeholder="e.g. General, Announcements, Support"
							bind:value={name}
							aria-invalid={!!errors.name}
						/>

						<!-- AI Suggestion Button (Right) -->
						<InputGroup.Addon align="inline-end">
							<InputGroup.Button
								type="button"
								onclick={handleAISuggestion}
								disabled={isSuggestingEmoji}
								size="icon-xs"
								variant="secondary"
								title="Suggest emoji with AI"
							>
								{#if isSuggestingEmoji}
									<Spinner class="h-3 w-3" />
								{:else}
									<SparklesIcon class="h-3 w-3" />
								{/if}
							</InputGroup.Button>
						</InputGroup.Addon>
					</InputGroup.Root>

					<Field.Description>
						A descriptive name for your channel. Click the sparkle icon for AI emoji suggestion.
					</Field.Description>
					{#if errors.name}
						<Field.Error>{errors.name}</Field.Error>
					{/if}
				</Field.Field>

				<!-- Channel Description -->
				<Field.Field>
					<Field.Label for="channel-description">Description</Field.Label>
					<Textarea
						id="channel-description"
						placeholder="What is this channel for?"
						bind:value={description}
						rows={3}
					/>
					<Field.Description>
						Optional description to help users understand the channel's purpose
					</Field.Description>
				</Field.Field>
			</Field.Group>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={handleCancel} disabled={isSubmitting}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Creating...' : 'Create Channel'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
