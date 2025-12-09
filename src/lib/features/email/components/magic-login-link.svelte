<script lang="ts">
	import {
		Html,
		Head,
		Preview,
		Body,
		Container,
		Section,
		Img,
		Text,
		Button
	} from 'better-svelte-email';
	import Footer from './blocks/footer.svelte';
	import { emailConfig } from './email.config';

	interface Props {
		url: string;
	}

	let { url = 'https://thedis.co' }: Props = $props();
</script>

<Html>
	<Head />
	<Body class="mx-auto my-auto bg-white font-sans">
		<Preview preview="Sign in to {emailConfig.appName}" />
		<Container
			class="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5"
		>
			<Section class="mt-8">
				<Img src={emailConfig.wordmarkImg} width="auto" height="16" alt={emailConfig.appName} />
			</Section>
			<Text class="mx-0 my-7 p-0 text-lg font-bold text-black">Sign in to your account</Text>
			<Text class="text-sm leading-6 text-black">
				Click the button below to sign in to {emailConfig.appName}.
			</Text>
			<Text class="text-sm leading-6 text-black">
				This link will expire in 15 minutes for security reasons.
			</Text>
			<Section class="my-8">
				<Button
					class="rounded-lg bg-black px-6 py-3 text-center text-[12px] font-semibold text-white no-underline"
					href={url}
				>
					Sign In
				</Button>
			</Section>
			<Text class="text-sm leading-6 text-black">
				Or copy and paste this link into your browser:
			</Text>
			<Text class="max-w-sm flex-wrap font-medium break-words text-purple-600 no-underline">
				{url.replace(/^https?:\/\//, '')}
			</Text>
			<Footer />
		</Container>
	</Body>
</Html>
