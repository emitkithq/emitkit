<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<div class="flex w-full max-w-lg flex-col gap-3">
	{#each { length: 6 } as _}
		<div class="flex items-start gap-3 rounded-lg border p-4">
			<Skeleton class="size-8 shrink-0 rounded-full" />
			<div class="flex-1 space-y-2">
				<Skeleton class="h-4 w-3/4" />
				<Skeleton class="h-3 w-1/2" />
			</div>
			<Skeleton class="h-3 w-16" />
		</div>
	{/each}
</div>
