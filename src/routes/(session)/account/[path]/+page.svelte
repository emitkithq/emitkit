<script lang="ts">
	import { AccountView } from 'better-auth-ui-svelte';
	import type { PageProps } from './$types.js';

	let { params }: PageProps = $props();
</script>

<AccountView path={params.path} />
