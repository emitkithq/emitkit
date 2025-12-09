import { getContext, setContext } from 'svelte';
import type { Component } from 'svelte';

const PAGE_ACTIONS_KEY = Symbol('page-actions');

interface PageAction {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Component props can be any shape
	component: Component<any>;
	props: Record<string, unknown>;
	ownerId: symbol;
	actionId: symbol;
}

interface ComponentWithProps {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Component props can be any shape
	component: Component<any>;
	props: Record<string, unknown>;
}

interface PageActionsContext {
	readonly leftActions: PageAction[];
	readonly rightActions: PageAction[];
	registerLeft(ownerId: symbol, components: ComponentWithProps[]): void;
	registerRight(ownerId: symbol, components: ComponentWithProps[]): void;
	unregister(ownerId: symbol): void;
}

export function createPageActionsContext() {
	let leftActions = $state<PageAction[]>([]);
	let rightActions = $state<PageAction[]>([]);

	const context: PageActionsContext = {
		get leftActions() {
			return leftActions;
		},
		get rightActions() {
			return rightActions;
		},
		registerLeft(ownerId: symbol, components: ComponentWithProps[]) {
			// Remove any existing actions from this owner on the left side
			leftActions = leftActions.filter((action) => action.ownerId !== ownerId);
			// Add the new actions with unique IDs
			const newActions = components.map(({ component, props }) => ({
				component,
				props,
				ownerId,
				actionId: Symbol('page-action')
			}));
			leftActions = [...leftActions, ...newActions];
		},
		registerRight(ownerId: symbol, components: ComponentWithProps[]) {
			// Remove any existing actions from this owner on the right side
			rightActions = rightActions.filter((action) => action.ownerId !== ownerId);
			// Add the new actions with unique IDs
			const newActions = components.map(({ component, props }) => ({
				component,
				props,
				ownerId,
				actionId: Symbol('page-action')
			}));
			rightActions = [...rightActions, ...newActions];
		},
		unregister(ownerId: symbol) {
			// Remove all actions from this owner
			leftActions = leftActions.filter((action) => action.ownerId !== ownerId);
			rightActions = rightActions.filter((action) => action.ownerId !== ownerId);
		}
	};

	setContext(PAGE_ACTIONS_KEY, context);

	return context;
}

export function getPageActionsContext(): PageActionsContext {
	const context = getContext<PageActionsContext>(PAGE_ACTIONS_KEY);

	if (!context) {
		throw new Error(
			'Page actions context not found. Make sure you are using this inside a component that has a PageActionsProvider ancestor.'
		);
	}

	return context;
}
