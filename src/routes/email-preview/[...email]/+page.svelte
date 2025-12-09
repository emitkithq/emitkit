<script lang="ts">
	import { EmailPreview } from 'better-svelte-email/preview';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<EmailPreview
	page={{
		url: page.url,
		params: page.params,
		data: {
			emails: data.emails
		}
	}}
/>
