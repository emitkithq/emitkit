<script lang="ts">
	import HashIcon from '@lucide/svelte/icons/hash';

	let { name }: { name: string } = $props();
</script>

<div class="flex items-center gap-1">
	<HashIcon class="size-4" />
	<span class="font-semibold">{name}</span>
</div>
