<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import PlusIcon from '@lucide/svelte/icons/plus';

	interface Props {
		onclick: () => void;
	}

	let { onclick }: Props = $props();
</script>

<Button size="xs" {onclick}>
	<PlusIcon class="h-4 w-4" />
	Create API Key
</Button>
