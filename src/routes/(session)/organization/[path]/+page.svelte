<script lang="ts">
	import { OrganizationView } from 'better-auth-ui-svelte';
	import type { PageProps } from './$types.js';

	let { params }: PageProps = $props();
</script>

hello
<OrganizationView path={params.path} />
