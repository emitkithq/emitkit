<script lang="ts">
	import { Html, Head, Body, Preview, Container, Section, Text, Button } from 'better-svelte-email';
	import { emailConfig } from './email.config';

	interface Props {
		resetPasswordURL: string;
	}

	let { resetPasswordURL = 'https://example.com/reset-password' }: Props = $props();
</script>

<Html>
	<Head />
	<Body class="bg-zinc-100">
		<Preview preview="Reset your password for {emailConfig.appName}" />
		<Container class="m-8 mx-auto max-w-lg rounded-2xl bg-white p-8">
			<Section>
				<Text class="text-xl font-bold text-black">Reset Your Password</Text>
				<Text class="mt-4 text-base text-gray-700">
					We received a request to reset your password for your {emailConfig.appName} account.
				</Text>
				<Text class="mt-2 text-base text-gray-700">
					Click the button below to create a new password:
				</Text>
				<Section class="my-6 text-center">
					<Button
						class="rounded-lg bg-black px-6 py-3 text-center text-sm font-semibold text-white no-underline"
						href={resetPasswordURL}
					>
						Reset Password
					</Button>
				</Section>
				<Text class="text-sm text-gray-600">
					This link will expire in 1 hour for security reasons.
				</Text>
				<Text class="mt-4 text-sm text-gray-600">
					If you didn't request a password reset, you can safely ignore this email. Your password
					will not be changed.
				</Text>
			</Section>
		</Container>
	</Body>
</Html>
