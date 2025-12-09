<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import { createChannelForm, suggestEmojiCommand } from '$lib/features/channels/channels.remote';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
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

	// Create a unique form instance for this modal using a unique key
	const formKey = `channel-modal-${Math.random().toString(36).substring(2, 9)}`;
	const form = createChannelForm.for(formKey);

	// Emoji picker state
	let selectedEmoji = $state<string>('');
	let emojiPickerOpen = $state(false);
	let emojiPickerMounted = $state(false);
	let isSuggestingEmoji = $state(false);

	// Mount emoji picker on first open to defer heavy initialization
	$effect(() => {
		if (emojiPickerOpen && !emojiPickerMounted) {
			emojiPickerMounted = true;
		}
	});

	// Helper to safely get field issues
	type FormField = {
		issues?: () => Array<{ message: string }> | undefined;
	};

	function getIssues(field: FormField | undefined): Array<{ message: string }> {
		return field?.issues?.() ?? [];
	}

	// Watch for pending state (pending is a counter of pending requests)
	const isPending = $derived(form.pending > 0);

	// Handle AI emoji suggestion
	async function handleAISuggestion() {
		const channelName = form.fields.name.value();

		if (!channelName || channelName.trim() === '' || channelName.length < 3) {
			return;
		}

		isSuggestingEmoji = true;

		try {
			const result = await suggestEmojiCommand({ channelName: channelName.trim() });

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

	// Watch for successful submission
	let previousPending = $state(0);
	$effect(() => {
		// When form goes from pending to not pending, check if we got a successful result
		if (previousPending > 0 && form.pending === 0) {
			// Form submission completed - close modal
			// You may need to check a success state here
			item.resolve({
				success: true,
				channelId: '' // This would come from the form result
			});
		}
		previousPending = form.pending;
	});
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="sm:max-w-[500px]">
		<Dialog.Header>
			<Dialog.Title>Create New Channel</Dialog.Title>
			<Dialog.Description>
				Add a new channel to organize your content and conversations.
			</Dialog.Description>
		</Dialog.Header>

		<form {...form} class="space-y-6">
			<!-- Hidden organizationId and projectId fields -->
			<input {...form.fields.organizationId.as('text')} type="hidden" value={organizationId} />
			<input {...form.fields.projectId.as('text')} type="hidden" value={projectId} />

			<Field.Group>
				<!-- Channel Name with Emoji Picker -->
				<Field.Field data-invalid={getIssues(form.fields.name).length > 0}>
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
							{...form.fields.name.as('text')}
							aria-invalid={getIssues(form.fields.name).length > 0}
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

					<!-- Hidden icon field -->
					<input {...form.fields.icon.as('text')} type="hidden" value={selectedEmoji} />

					<Field.Description>
						A descriptive name for your channel. Click the sparkle icon for AI emoji suggestion.
					</Field.Description>
					{#each getIssues(form.fields.name) as issue, i (i)}
						<Field.Error>{issue.message}</Field.Error>
					{/each}
				</Field.Field>

				<!-- Channel Description -->
				<Field.Field data-invalid={getIssues(form.fields.description).length > 0}>
					<Field.Label for="channel-description">Description</Field.Label>
					<Textarea
						id="channel-description"
						placeholder="What is this channel for?"
						{...form.fields.description.as('text')}
						rows={3}
						aria-invalid={getIssues(form.fields.description).length > 0}
					/>
					<Field.Description>
						Optional description to help users understand the channel's purpose
					</Field.Description>
					{#each getIssues(form.fields.description) as issue, i (i)}
						<Field.Error>{issue.message}</Field.Error>
					{/each}
				</Field.Field>
			</Field.Group>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={handleCancel} disabled={isPending}>
					Cancel
				</Button>
				<Button type="submit" disabled={isPending}>
					{isPending ? 'Creating...' : 'Create Channel'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
