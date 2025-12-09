<script lang="ts">
	import { Html, Head, Body, Preview, Container, Section, Text, Button } from 'better-svelte-email';

	interface Props {
		verifyEmailURL: string;
		newsletterName: string;
	}

	let { verifyEmailURL = 'https://example.com/verify', newsletterName = 'Newsletter' }: Props =
		$props();
</script>

<Html>
	<Head />
	<Body class="bg-zinc-100">
		<Preview preview="Confirm your subscription to {newsletterName}" />
		<Container class="m-8 mx-auto max-w-lg rounded-2xl bg-white p-8">
			<Section>
				<Text class="text-xl font-bold text-black">Confirm Your Subscription</Text>
				<Text class="mt-4 text-base text-gray-700">
					Please confirm your email address to complete your subscription to {newsletterName}.
				</Text>
				<Section class="my-6 text-center">
					<Button
						class="rounded-lg bg-black px-6 py-3 text-center text-sm font-semibold text-white no-underline"
						href={verifyEmailURL}
					>
						Verify Email
					</Button>
				</Section>
				<Text class="text-sm text-gray-600">
					This link will expire in 24 hours for security reasons.
				</Text>
				<Text class="mt-4 text-sm text-gray-600">
					If you didn't request this verification, you can safely ignore this email.
				</Text>
			</Section>
		</Container>
	</Body>
</Html>
