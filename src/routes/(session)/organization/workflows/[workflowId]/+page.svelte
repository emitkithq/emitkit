<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import { Badge } from '$lib/components/ui/badge';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Tabs from '$lib/components/ui/tabs';
	import WorkflowCanvas from '$lib/features/workflows/components/workflow-canvas.svelte';
	import WorkflowSidebarEmpty from '$lib/features/workflows/components/workflow-sidebar-empty.svelte';
	import { workflowStore } from '$lib/features/workflows/stores/workflow-store.svelte';
	import { updateWorkflowCommand, executeWorkflowCommand } from '$lib/features/workflows/workflows.remote';
	import { goto } from '$app/navigation';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { toast } from 'svelte-sonner';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SaveIcon from '@lucide/svelte/icons/save';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import ZapOffIcon from '@lucide/svelte/icons/zap-off';
	import PlayIcon from '@lucide/svelte/icons/play';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import type { WorkflowNode, TriggerConfig, ActionConfig } from '$lib/features/workflows/types';
	import type { Node } from '@xyflow/svelte';
	import { TriggerConfig as TriggerConfigComponent, ActionConfig as ActionConfigComponent } from '$lib/features/workflows/components/config';
	import WorkflowRuns from '$lib/features/workflows/components/workflow-runs.svelte';
	import ActionGrid from '$lib/features/workflows/components/config/action-grid.svelte';
	import type { ActionTemplate } from '$lib/features/workflows/action-templates';
	import WorkflowDebugPanel from '$lib/features/workflows/components/workflow-debug-panel.svelte';

	let { data }: { data: PageData } = $props();

	// Workflow metadata state (editable)
	let workflowName = $derived(data.workflow.name);
	let workflowDescription = $derived(data.workflow.description || '');
	let workflowEnabled = $derived(data.workflow.enabled);
	let isSavingMetadata = $state(false);
	let isExecuting = $state(false);

	// Sync state with prop changes (e.g., when navigating between workflows)
	$effect(() => {
		workflowName = data.workflow.name;
		workflowDescription = data.workflow.description || '';
		workflowEnabled = data.workflow.enabled;
	});

	// Selected node for configuration
	let selectedNode = $state<Node<WorkflowNode['data'], WorkflowNode['type']> | null>(null);
	let showRightSidebar = $state(true); // Always show sidebar, will display empty state when nothing selected
	let isAddingNode = $state(false); // Track if we're in "add node" mode

	// Save workflow metadata
	async function saveMetadata() {
		isSavingMetadata = true;
		try {
			await updateWorkflowCommand({
				workflowId: data.workflow.id,
				name: workflowName,
				description: workflowDescription || undefined,
				enabled: workflowEnabled
			});
			toast.success('Workflow settings saved');
		} catch (error) {
			console.error('Failed to save workflow metadata:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to save workflow settings';
			toast.error(errorMessage);
		} finally {
			isSavingMetadata = false;
		}
	}

	// Handle node click
	function handleNodeClick(node: Node<WorkflowNode['data'], WorkflowNode['type']>) {
		// If clicking on an "add" node, convert it to an action node with undefined actionType
		// This will trigger the action grid to show in the config panel
		if (node.type === 'add') {
			// Replace the add node with an action node
			workflowStore.deleteNode(node.id);
			const newNode = workflowStore.addNode('action', node.position, {
				label: 'New Action',
				description: 'Choose from action library',
				config: { actionType: undefined } as ActionConfig
			});

			// Select the new node and enter "add node" mode
			selectedNode = newNode as Node<WorkflowNode['data'], WorkflowNode['type']>;
			isAddingNode = true;
		} else {
			selectedNode = node;
			isAddingNode = false;
		}

		showRightSidebar = true;
	}

	// Handle canvas click (deselect node)
	function handleCanvasClick() {
		selectedNode = null;
		isAddingNode = false;
		// Keep sidebar open to show empty state
	}

	// Handle "Add Node" button click from empty state
	function handleAddNodeFromEmpty() {
		isAddingNode = true;
		selectedNode = null; // Deselect any selected node
	}

	// Handle action selection from action grid
	function handleActionSelected(template: ActionTemplate) {
		const centerX = 400;
		const centerY = 300;
		const randomOffset = () => Math.floor(Math.random() * 100) - 50;

		// Add node to canvas
		const newNode = workflowStore.addNode('action', { x: centerX + randomOffset(), y: centerY + randomOffset() }, {
			label: template.name,
			description: template.description,
			config: template.config
		});

		// Select the new node
		selectedNode = newNode as Node<WorkflowNode['data'], WorkflowNode['type']>;
		isAddingNode = false;

		toast.success(`Added ${template.name}`);
	}

	// Handle test workflow execution
	async function handleTestWorkflow() {
		isExecuting = true;
		try {
			const result = await executeWorkflowCommand({
				workflowId: data.workflow.id,
				triggerInput: {
					test: true,
					timestamp: Date.now()
				}
			});

			toast.success(`Workflow started: ${result.workflowRunId}`);

			// Switch to Runs tab to see execution
			workflowStore.setActivePanelTab('runs');
		} catch (error) {
			console.error('Failed to execute workflow:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to execute workflow';
			toast.error(errorMessage);
		} finally {
			isExecuting = false;
		}
	}
</script>

<div class="flex h-screen flex-col">
	<!-- Top Toolbar -->
	<div class="border-b bg-card">
		<div class="flex items-center justify-between px-4 py-3">
			<div class="flex items-center gap-4">
				<Button variant="ghost" size="sm" onclick={() => goto('/organization/workflows')}>
					<ArrowLeftIcon class="h-4 w-4" />
				</Button>
				<Separator orientation="vertical" class="h-6" />
				<div class="flex items-center gap-3">
					<Input
						type="text"
						bind:value={workflowName}
						class="max-w-xs border-none text-lg font-semibold focus-visible:ring-1"
						placeholder="Workflow name"
						onblur={saveMetadata}
					/>
					<Badge variant={workflowEnabled ? 'default' : 'secondary'}>
						{#if workflowEnabled}
							<ZapIcon class="mr-1 h-3 w-3" />
							Active
						{:else}
							<ZapOffIcon class="mr-1 h-3 w-3" />
							Disabled
						{/if}
					</Badge>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<div class="flex items-center gap-2">
					<Switch id="enabled" bind:checked={workflowEnabled} onchange={saveMetadata} />
					<Label for="enabled" class="text-sm">Enable</Label>
				</div>
				<Separator orientation="vertical" class="h-6" />
				<Button
					variant="outline"
					size="sm"
					onclick={handleTestWorkflow}
					disabled={!workflowEnabled || isExecuting}
				>
					<PlayIcon class="mr-2 h-4 w-4" />
					{isExecuting ? 'Running...' : 'Test Workflow'}
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() => workflowStore.forceSave()}
					disabled={!workflowStore.isDirty}
				>
					<SaveIcon class="mr-2 h-4 w-4" />
					{workflowStore.isDirty ? 'Save' : 'Saved'}
				</Button>
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Canvas (full width when sidebar closed) -->
		<div class="flex-1">
			<SvelteFlowProvider>
				<WorkflowCanvas
					workflowId={data.workflow.id}
					initialNodes={data.workflow.nodes}
					initialEdges={data.workflow.edges}
					onNodeClick={handleNodeClick}
					onCanvasClick={handleCanvasClick}
				/>
			</SvelteFlowProvider>
		</div>

		<!-- Right Sidebar -->
		{#if showRightSidebar}
			<div class="w-96 overflow-y-auto border-l bg-card">
				{#if isAddingNode}
					<!-- Action Grid for adding new nodes -->
					<ActionGrid onSelect={handleActionSelected} />
				{:else if selectedNode}
					<!-- Node Configuration (existing tabs) -->
					<Tabs.Root
						value={workflowStore.activePanelTab}
						onValueChange={(value) => {
							if (value) {
								workflowStore.setActivePanelTab(value as 'properties' | 'runs' | 'code');
							}
						}}
						class="h-full"
					>
						<div class="border-b px-4 py-3">
							<div class="mb-3 flex items-center gap-2">
								<SettingsIcon class="h-5 w-5 text-muted-foreground" />
								<h3 class="text-lg font-semibold">Node Configuration</h3>
							</div>
							<Tabs.List class="grid w-full grid-cols-3">
								<Tabs.Trigger value="properties">Properties</Tabs.Trigger>
								<Tabs.Trigger value="runs">Runs</Tabs.Trigger>
								<Tabs.Trigger value="code">Code</Tabs.Trigger>
							</Tabs.List>
						</div>

						<Tabs.Content value="properties" class="p-4">
							<div class="space-y-4">
								<div>
								<Label for="node-label">Label</Label>
								<Input
									id="node-label"
									value={selectedNode.data.label}
									onchange={(e) => {
										if (selectedNode) {
											workflowStore.updateNode(selectedNode.id, {
												label: e.currentTarget.value
											});
										}
									}}
								/>
							</div>

							<div>
								<Label for="node-description">Description</Label>
								<Textarea
									id="node-description"
									value={selectedNode.data.description || ''}
									onchange={(e) => {
										if (selectedNode) {
											workflowStore.updateNode(selectedNode.id, {
												description: e.currentTarget.value
											});
										}
									}}
								/>
							</div>

							<Separator />

							<!-- Node-specific config -->
							{#if selectedNode.type === 'trigger'}
								<TriggerConfigComponent
									config={selectedNode.data.config as TriggerConfig}
									onUpdate={(update: Partial<TriggerConfig>, label?: string) => {
										if (selectedNode) {
											workflowStore.updateNode(selectedNode.id, {
												config: { ...selectedNode.data.config, ...update },
												...(label ? { label } : {})
											});
										}
									}}
									channels={data.channels || []}
									folders={data.folders || []}
								/>
							{:else if selectedNode.type === 'action'}
								<ActionConfigComponent
									config={selectedNode.data.config as ActionConfig}
									onUpdate={(update: Partial<ActionConfig>, label?: string) => {
										if (selectedNode) {
											workflowStore.updateNode(selectedNode.id, {
												config: { ...selectedNode.data.config, ...update },
												...(label ? { label } : {})
											});
										}
									}}
								/>
							{/if}

							<Separator />

								<Button
									variant="destructive"
									size="sm"
									class="w-full"
									onclick={() => {
										if (selectedNode) {
											workflowStore.deleteNode(selectedNode.id);
											selectedNode = null;
										}
									}}
								>
									Delete Node
								</Button>
							</div>
						</Tabs.Content>

						<!-- Runs Tab -->
						<Tabs.Content value="runs" class="p-4">
							<WorkflowRuns workflowId={data.workflow.id} nodeId={selectedNode.id} />
						</Tabs.Content>

						<!-- Code Tab -->
						<Tabs.Content value="code" class="p-4">
							<div class="space-y-4">
								<p class="text-sm text-muted-foreground">
									Generated code for this node will be displayed here.
								</p>
								<!-- Code generation will go here -->
							</div>
						</Tabs.Content>
					</Tabs.Root>
				{:else}
					<!-- Empty State -->
					<WorkflowSidebarEmpty onAddNode={handleAddNodeFromEmpty} />
				{/if}
			</div>
		{/if}
	</div>

	<!-- Debug Panel (dev mode only) -->
	<WorkflowDebugPanel {data} />
</div>
