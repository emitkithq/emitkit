import { getContext, setContext } from 'svelte';
import type { Component } from 'svelte';

const BREADCRUMB_ACTIONS_KEY = Symbol('breadcrumb-actions');

interface BreadcrumbAction {
	component: Component<any>;
	props: Record<string, any>;
}

interface BreadcrumbActionsContext {
	action: BreadcrumbAction | null;
}

export function createBreadcrumbActionsContext() {
	let action = $state<BreadcrumbAction | null>(null);

	const context: BreadcrumbActionsContext = {
		get action() {
			return action;
		},
		set action(value: BreadcrumbAction | null) {
			action = value;
		}
	};

	setContext(BREADCRUMB_ACTIONS_KEY, context);

	return context;
}

export function getBreadcrumbActionsContext(): BreadcrumbActionsContext {
	const context = getContext<BreadcrumbActionsContext>(BREADCRUMB_ACTIONS_KEY);

	if (!context) {
		throw new Error(
			'Breadcrumb actions context not found. Make sure you are using this inside a component that has a BreadcrumbActionsProvider ancestor.'
		);
	}

	return context;
}
