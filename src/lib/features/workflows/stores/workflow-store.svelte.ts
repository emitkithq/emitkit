import type { WorkflowNode, WorkflowEdge } from '$lib/features/workflows/types';
import type { Node, Edge, Connection } from '@xyflow/svelte';
import { updateWorkflowCommand } from '$lib/features/workflows/workflows.remote';
import { toast } from 'svelte-sonner';

type WorkflowState = {
	nodes: Node<WorkflowNode['data'], WorkflowNode['type']>[];
	edges: Edge<WorkflowEdge>[];
	selectedNodeId: string | null;
	isDirty: boolean;
	workflowId: string | null;
	activePanelTab: 'properties' | 'runs' | 'code';
};

class WorkflowStore {
	private state = $state.raw<WorkflowState>({
		nodes: [],
		edges: [],
		selectedNodeId: null,
		isDirty: false,
		workflowId: null,
		activePanelTab: 'properties'
	});

	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private readonly AUTOSAVE_DELAY = 750;

	// Getters using $derived for reactivity
	get nodes() {
		return this.state.nodes;
	}

	get edges() {
		return this.state.edges;
	}

	get selectedNodeId() {
		return this.state.selectedNodeId;
	}

	get isDirty() {
		return this.state.isDirty;
	}

	get workflowId() {
		return this.state.workflowId;
	}

	get selectedNode() {
		return this.state.nodes.find((n) => n.id === this.state.selectedNodeId);
	}

	get activePanelTab() {
		return this.state.activePanelTab;
	}

	setActivePanelTab(tab: 'properties' | 'runs' | 'code') {
		this.state.activePanelTab = tab;
	}

	// Initialize workflow data
	initialize(workflowId: string, nodes: WorkflowNode[], edges: WorkflowEdge[]) {
		// Convert WorkflowNode to XYFlow Node format
		let xyflowNodes: Node<WorkflowNode['data'], WorkflowNode['type']>[] = nodes.map((node) => ({
			id: node.id,
			type: node.type,
			position: node.position,
			data: node.data,
			selected: node.selected
		}));

		// If workflow is empty, add a placeholder "add" node
		// This is UI-only and won't be persisted to the database
		if (xyflowNodes.length === 0) {
			xyflowNodes = [
				{
					id: 'add-node-initial',
					type: 'add' as const,
					position: { x: 400, y: 300 },
					data: {
						label: 'Add Node',
						description: 'Click to choose an action',
						config: { actionType: undefined } as any
					}
				}
			];
		}

		// Convert WorkflowEdge to XYFlow Edge format
		const xyflowEdges: Edge<WorkflowEdge>[] = edges.map((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			type: edge.type,
			selected: edge.selected
		}));

		this.state.nodes = xyflowNodes;
		this.state.edges = xyflowEdges;
		this.state.workflowId = workflowId;
		this.state.isDirty = false;
		this.state.selectedNodeId = null;
	}

	// Set nodes (called by XYFlow onNodesChange)
	setNodes(nodes: Node<WorkflowNode['data'], WorkflowNode['type']>[]) {
		this.state.nodes = nodes;
		this.markDirty();
	}

	// Set edges (called by XYFlow onEdgesChange)
	setEdges(edges: Edge<WorkflowEdge>[]) {
		this.state.edges = edges;
		this.markDirty();
	}

	// Add a new node
	addNode(
		type: WorkflowNode['type'],
		position: { x: number; y: number },
		data: WorkflowNode['data']
	) {
		const newNode: Node<WorkflowNode['data'], WorkflowNode['type']> = {
			id: `node-${Date.now()}`,
			type,
			position,
			data
		};

		this.state.nodes = [...this.state.nodes, newNode];
		this.markDirty();

		return newNode;
	}

	// Update node data
	updateNode(nodeId: string, data: Partial<WorkflowNode['data']>) {
		this.state.nodes = this.state.nodes.map((node) =>
			node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
		);
		this.markDirty();
	}

	// Delete node
	deleteNode(nodeId: string) {
		this.state.nodes = this.state.nodes.filter((node) => node.id !== nodeId);
		// Also remove connected edges
		this.state.edges = this.state.edges.filter(
			(edge) => edge.source !== nodeId && edge.target !== nodeId
		);
		if (this.state.selectedNodeId === nodeId) {
			this.state.selectedNodeId = null;
		}
		this.markDirty();
	}

	// Add edge (called when connecting nodes)
	addEdge(connection: Connection) {
		const newEdge: Edge<WorkflowEdge> = {
			id: `edge-${connection.source}-${connection.target}`,
			source: connection.source,
			target: connection.target,
			type: 'default'
		};

		this.state.edges = [...this.state.edges, newEdge];
		this.markDirty();
		return newEdge;
	}

	// Delete edge
	deleteEdge(edgeId: string) {
		this.state.edges = this.state.edges.filter((edge) => edge.id !== edgeId);
		this.markDirty();
	}

	// Update edge type
	updateEdgeType(edgeId: string, type: 'default' | 'straight' | 'step') {
		this.state.edges = this.state.edges.map((edge) =>
			edge.id === edgeId ? { ...edge, type } : edge
		);
		this.markDirty();
	}

	// Duplicate node
	duplicateNode(nodeId: string) {
		const node = this.state.nodes.find((n) => n.id === nodeId);
		if (!node) return null;

		const newNode: Node<WorkflowNode['data'], WorkflowNode['type']> = {
			...node,
			id: `node-${Date.now()}`,
			position: {
				x: node.position.x + 50,
				y: node.position.y + 50
			},
			data: {
				...node.data,
				label: `${node.data.label} (Copy)`
			},
			selected: false
		};

		this.state.nodes = [...this.state.nodes, newNode];
		this.markDirty();
		return newNode;
	}

	// Toggle node enabled state
	toggleNodeEnabled(nodeId: string) {
		this.state.nodes = this.state.nodes.map((node) =>
			node.id === nodeId
				? {
						...node,
						data: {
							...node.data,
							enabled: node.data.enabled === false ? true : false
						}
					}
				: node
		);
		this.markDirty();
	}

	// Clear all selections
	clearSelection() {
		this.state.nodes = this.state.nodes.map((node) => ({ ...node, selected: false }));
		this.state.edges = this.state.edges.map((edge) => ({ ...edge, selected: false }));
		this.state.selectedNodeId = null;
	}

	// Select node
	selectNode(nodeId: string | null) {
		this.state.selectedNodeId = nodeId;
	}

	// Mark as dirty and trigger autosave
	private markDirty() {
		this.state.isDirty = true;
		this.scheduleAutosave();
	}

	// Schedule autosave with debounce
	private scheduleAutosave() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}

		this.saveTimeout = setTimeout(() => {
			this.save();
		}, this.AUTOSAVE_DELAY);
	}

	// Save workflow to server
	async save() {
		if (!this.state.isDirty || !this.state.workflowId) {
			return;
		}

		try {
			// Convert back to WorkflowNode/WorkflowEdge format for storage
			// Filter out 'add' nodes - they are UI-only placeholders
			const nodes: WorkflowNode[] = this.state.nodes
				.filter((node) => node.type !== 'add')
				.map((node) => ({
					id: node.id,
					type: node.type as WorkflowNode['type'],
					position: node.position,
					data: node.data,
					selected: node.selected
				}));

			const edges: WorkflowEdge[] = this.state.edges.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				type: edge.type as WorkflowEdge['type'],
				condition: edge.data?.condition,
				selected: edge.selected
			}));

			// Use SvelteKit remote function instead of direct fetch
			await updateWorkflowCommand({
				workflowId: this.state.workflowId,
				nodes: nodes as any,
				edges: edges as any
			});

			this.state.isDirty = false;
			toast.success('Workflow saved');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to save workflow';
			toast.error(errorMessage);
			throw error;
		}
	}

	// Force save (for explicit save button)
	async forceSave() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		await this.save();
	}

	// Reset store
	reset() {
		this.state.nodes = [];
		this.state.edges = [];
		this.state.selectedNodeId = null;
		this.state.isDirty = false;
		this.state.workflowId = null;
		this.state.activePanelTab = 'properties';
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
	}
}

// Export singleton instance
export const workflowStore = new WorkflowStore();
