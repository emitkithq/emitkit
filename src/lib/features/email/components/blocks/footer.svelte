<script lang="ts">
	import { Text, Hr } from 'better-svelte-email';
	import { emailConfig } from '../email.config';
</script>

<Hr class="mx-0 my-6 w-full border border-solid border-neutral-200" />
<Text class="text-xs leading-6 text-neutral-400">
	© {new Date().getFullYear()}
	{emailConfig.appName}. All rights reserved.
</Text>
<Text class="text-xs leading-6 text-neutral-400">
	This email was sent to you because you requested a sign-in link. If you didn't request this, you
	can safely ignore this email.
</Text>
