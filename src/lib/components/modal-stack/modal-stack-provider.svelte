<script lang="ts" module>
	import type { ModalStack } from '$lib/components/modal-stack/config.js';
	import { getContext, setContext } from 'svelte';

	const _contextKey = '$$_modalStack';

	export function useModals(): ModalStack & { popAll: () => void } {
		const client = getContext<ModalStack>(_contextKey);

		if (!client) {
			throw new Error(
				'No modal stack was found in Svelte context. Did you forget to wrap your component with ModalStackProvider?'
			);
		}

		return Object.assign(client, {
			popAll: () => {
				while (client.items.length > 0) {
					client.pop();
				}
			}
		});
	}

	export function setModalStack(context: ModalStack): void {
		setContext(_contextKey, context);
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { modalStack } from '$lib/components/modal-stack/config.js';
	import { onNavigate } from '$app/navigation';

	const { children }: { children: Snippet } = $props();

	setModalStack(modalStack);

	const ms = useModals();

	onNavigate(() => {
		ms.popAll();
	});
</script>

{#each ms.items as item (item.config.id)}
	<item.config.component {item} {...item.config.props} />
{/each}

{@render children()}
