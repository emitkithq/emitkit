<script lang="ts">
	import ConfigField from './config-field.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import type { TriggerConfig, TriggerType } from '$lib/features/workflows/types';
	import XIcon from '@lucide/svelte/icons/x';

	interface Props {
		config: TriggerConfig;
		onUpdate: (config: Partial<TriggerConfig>, label?: string) => void;
		channels?: Array<{ id: string; name: string }>;
		folders?: Array<{ id: string; name: string }>;
	}

	let { config, onUpdate, channels = [], folders = [] }: Props = $props();

	// Map trigger types to labels
	const triggerTypeLabels: Record<TriggerType, string> = {
		folder: 'Folder Event',
		channel: 'Channel Event',
		event_type: 'Event Type',
		tag: 'Tag Match'
	};

	// Tag management state
	let tagInput = $state('');

	function addTag() {
		if (!tagInput.trim()) return;
		const currentTags = config.tags || [];
		if (!currentTags.includes(tagInput.trim())) {
			onUpdate({ tags: [...currentTags, tagInput.trim()] });
		}
		tagInput = '';
	}

	function removeTag(tag: string) {
		const currentTags = config.tags || [];
		onUpdate({ tags: currentTags.filter((t) => t !== tag) });
	}

	// Event type options (common event types)
	const eventTypeOptions = [
		{ value: 'created', label: 'Event Created' },
		{ value: 'updated', label: 'Event Updated' },
		{ value: 'deleted', label: 'Event Deleted' },
		{ value: 'published', label: 'Event Published' }
	];

	let selectedEventTypes = $derived<string[]>(config.eventTypes || []);

	function toggleEventType(eventType: string) {
		const current = selectedEventTypes || [];
		if (current.includes(eventType)) {
			selectedEventTypes = current.filter((t) => t !== eventType);
		} else {
			selectedEventTypes = [...current, eventType];
		}
		onUpdate({ eventTypes: selectedEventTypes });
	}
</script>

<div class="space-y-4">
	<!-- Trigger Type Selector -->
	<ConfigField
		label="Trigger Type"
		type="select"
		value={config.triggerType ?? ''}
		onchange={(value) => {
			const newTriggerType = value as TriggerType;
			onUpdate(
				{
					triggerType: newTriggerType,
					// Clear previous config when changing type
					folderId: undefined,
					channelId: undefined,
					eventTypes: undefined,
					tags: undefined
				},
				triggerTypeLabels[newTriggerType] // Pass the new label
			);
		}}
		options={[
			{ value: 'folder', label: 'Folder Event' },
			{ value: 'channel', label: 'Channel Event' },
			{ value: 'event_type', label: 'Event Type' },
			{ value: 'tag', label: 'Tag Match' }
		]}
		description="What should trigger this workflow?"
		required
	/>

	<!-- Folder-specific config -->
	{#if config.triggerType === 'folder'}
		<ConfigField
			label="Folder"
			type="select"
			value={config.folderId}
			onchange={(value) => onUpdate({ folderId: String(value) })}
			options={folders.map((f) => ({ value: f.id, label: f.name }))}
			placeholder="Select a folder..."
			description="Trigger when events occur in this folder"
			required
		/>
	{/if}

	<!-- Channel-specific config -->
	{#if config.triggerType === 'channel'}
		<ConfigField
			label="Channel"
			type="select"
			value={config.channelId}
			onchange={(value) => onUpdate({ channelId: String(value) })}
			options={channels.map((c) => ({ value: c.id, label: c.name }))}
			placeholder="Select a channel..."
			description="Trigger when events occur in this channel"
			required
		/>
	{/if}

	<!-- Event type config -->
	{#if config.triggerType === 'event_type'}
		<div class="space-y-2">
			<Label class="text-sm font-medium">Event Types</Label>
			<p class="text-xs text-muted-foreground">
				Select which event types should trigger this workflow
			</p>
			<div class="flex flex-wrap gap-2">
				{#each eventTypeOptions as option}
					<button
						type="button"
						onclick={() => toggleEventType(option.value)}
						class="rounded-md border px-3 py-1.5 text-sm transition-colors {selectedEventTypes.includes(
							option.value
						)
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-input bg-background hover:bg-accent'}"
					>
						{option.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Tag config -->
	{#if config.triggerType === 'tag'}
		<div class="space-y-2">
			<Label class="text-sm font-medium">Tags</Label>
			<p class="text-xs text-muted-foreground">Trigger when events have any of these tags</p>

			<!-- Tag input -->
			<div class="flex gap-2">
				<Input
					bind:value={tagInput}
					placeholder="Enter a tag..."
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							addTag();
						}
					}}
				/>
				<button
					type="button"
					onclick={addTag}
					class="rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90"
				>
					Add
				</button>
			</div>

			<!-- Tag list -->
			{#if config.tags && config.tags.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each config.tags as tag}
						<Badge variant="secondary" class="gap-1">
							{tag}
							<button
								type="button"
								onclick={() => removeTag(tag)}
								class="ml-1 rounded-full hover:bg-muted"
							>
								<XIcon class="h-3 w-3" />
							</button>
						</Badge>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
