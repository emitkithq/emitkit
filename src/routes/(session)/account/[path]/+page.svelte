<script lang="ts">
	import { AccountView } from 'better-auth-ui-svelte';
	import type { PageProps } from './$types.js';

	let { data, params }: PageProps = $props();
</script>

<AccountView path={params.path} />
