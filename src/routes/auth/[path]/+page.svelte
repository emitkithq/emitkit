<script lang="ts">
	import { page } from '$app/state';
	import { AuthView } from 'better-auth-ui-svelte';
</script>

<AuthView
	path={page.params.path}
	classNames={{
		base: 'border-none shadow-none bg-transparent',
		title: 'md:text-2xl font-semibold',
		description: 'md:text-base text-muted-foreground'
	}}
/>
