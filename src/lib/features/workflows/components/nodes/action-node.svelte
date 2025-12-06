<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import type { WorkflowNode } from '$lib/features/workflows/types';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';

	interface Props extends NodeProps {
		data: WorkflowNode['data'];
	}

	let { data, selected }: Props = $props();

	// Get action config
	const actionConfig = $derived(
		data?.config && 'actionType' in data.config ? data.config : { actionType: 'unknown' }
	);

	// Check if node is properly configured
	const isConfigured = $derived(
		data?.config &&
		'actionType' in data.config &&
		data.config.actionType !== undefined &&
		data.config.actionType !== null
	);

	// Status color mapping
	const statusColors = {
		idle: 'bg-card border-border',
		running: 'bg-blue-100/20 border-blue-400 dark:bg-blue-900/20',
		success: 'bg-green-100/20 border-green-400 dark:bg-green-900/20',
		error: 'bg-red-100/20 border-red-400 dark:bg-red-900/20'
	};

	const statusColor = $derived(
		!isConfigured
			? 'bg-yellow-50/50 border-yellow-400 dark:bg-yellow-900/10'
			: statusColors[data?.status ?? 'idle']
	);

	// Action type icon/color mapping
	const actionStyles = {
		slack: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-600 dark:text-purple-400' },
		discord: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-600 dark:text-blue-400' },
		email: { bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-600 dark:text-orange-400' },
		http: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-600 dark:text-green-400' },
		condition: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-600 dark:text-yellow-400' },
		unknown: { bg: 'bg-muted', text: 'text-muted-foreground' }
	};

	const actionStyle = $derived(
		actionStyles[actionConfig.actionType as keyof typeof actionStyles] ?? actionStyles.unknown
	);
</script>

<div
	class="min-w-[200px] rounded-lg border-2 p-4 shadow-md transition-all {statusColor}"
	class:ring-2={selected}
	class:ring-blue-500={selected}
>
	<!-- Header -->
	<div class="mb-2 flex items-center gap-2">
		<div class="flex h-8 w-8 items-center justify-center rounded-full {actionStyle.bg}">
			<ZapIcon class="h-4 w-4 {actionStyle.text}" />
		</div>
		<div class="flex-1">
			<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Action</div>
		</div>
	</div>

	<!-- Content -->
	<div class="mb-2">
		<div class="font-semibold text-foreground">{data?.label ?? 'Action'}</div>
		{#if data?.description}
			<div class="mt-1 text-xs text-muted-foreground">{data.description}</div>
		{/if}
	</div>

	<!-- Warning for unconfigured node -->
	{#if !isConfigured}
		<div class="mb-2 flex items-center gap-2 rounded-md bg-yellow-100 px-2 py-1.5 dark:bg-yellow-900/30">
			<AlertTriangleIcon class="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
			<span class="text-xs font-medium text-yellow-700 dark:text-yellow-300">
				Not configured
			</span>
		</div>
	{/if}

	<!-- Action Type Badge -->
	{#if isConfigured}
		<div class="mt-2">
			<span
				class="inline-flex items-center rounded-full px-2 py-1 text-xs {actionStyle.bg} {actionStyle.text}"
			>
				{actionConfig.actionType}
			</span>
		</div>
	{/if}

	<!-- Input Handle (only target) -->
	<Handle
		type="target"
		position={Position.Left}
		class="!h-3 !w-3 !border-2 !border-foreground/60 !bg-muted"
	/>

	<!-- Output Handle (also source for chaining actions) -->
	<Handle
		type="source"
		position={Position.Right}
		class="!h-3 !w-3 !border-2 !border-foreground/60 !bg-muted"
	/>
</div>

<style>
	:global(.svelte-flow__handle) {
		background: hsl(var(--card));
	}
</style>
