<script lang="ts">
	import { Html, Head, Body, Preview, Container, Section, Text } from 'better-svelte-email';
	import { emailConfig } from '$lib/features/email/components/email.config';

	interface Props {
		firstName: string;
	}

	let { firstName = 'there' }: Props = $props();
</script>

<Html>
	<Head />
	<Body class="bg-zinc-100">
		<Preview preview="Welcome to {emailConfig.appName}" />
		<Container class="m-8 mx-auto max-w-lg rounded-2xl bg-white p-8">
			<Section class="mx-auto text-center">
				<Text class="text-2xl font-bold text-black">Welcome, {firstName}! 👋</Text>
				<Text class="mt-4 text-base text-gray-700">
					Thanks for joining {emailConfig.appName}. We're excited to have you on board!
				</Text>
				<Text class="mt-2 text-sm text-gray-600">
					Get started by exploring your dashboard and setting up your first channel.
				</Text>
			</Section>
		</Container>
	</Body>
</Html>
