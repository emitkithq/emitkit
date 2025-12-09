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
		otp: string;
		type: 'sign-in' | 'email-verification' | 'forget-password';
		isMobile?: boolean;
	}

	let { otp = '123456', type = 'sign-in', isMobile = false }: Props = $props();

	const titles = {
		'sign-in': 'Sign in to your account',
		'email-verification': 'Verify your email address',
		'forget-password': 'Reset your password'
	};

	const descriptions = {
		'sign-in': 'Use this code to sign in to',
		'email-verification': 'Use this code to verify your email for',
		'forget-password': 'Use this code to reset your password for'
	};

	// Link to open the app
	const appUrl = emailConfig.baseUrl;
</script>

<Html>
	<Head />
	<Body class="mx-auto my-auto bg-white font-sans">
		<Preview preview={titles[type]} />
		<Container
			class="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5"
		>
			<Section class="mt-8">
				<Img src={emailConfig.wordmarkImg} width="auto" height="16" alt={emailConfig.appName} />
			</Section>
			<Text class="mx-0 my-7 p-0 text-lg font-bold text-black">{titles[type]}</Text>
			<Text class="text-sm leading-6 text-black">
				{descriptions[type]}
				{emailConfig.appName}.
			</Text>

			{#if isMobile}
				<!-- Mobile-specific quick access notice -->
				<Section
					class="my-6 rounded-lg border border-solid border-blue-200 bg-blue-50 px-6 py-5 text-center"
				>
					<Text class="mb-2 text-sm font-semibold text-blue-900">📱 On mobile? Quick access:</Text>
					<Text class="mb-4 text-sm leading-6 text-blue-800">
						Tap the button below to open {emailConfig.appName} and paste your code:
					</Text>
					<Button
						href={appUrl}
						class="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white no-underline"
						style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;"
					>
						Open {emailConfig.appName}
					</Button>
				</Section>
			{/if}

			<Section class="my-8 rounded-lg bg-neutral-50 px-6 py-8 text-center">
				<Text class="mb-2 text-sm font-medium text-neutral-600">Your verification code</Text>
				<div
					style="display: inline-block; background-color: #000; color: #fff; padding: 16px 32px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 0.15em;"
				>
					{otp}
				</div>
				{#if isMobile}
					<Text class="mt-4 text-xs text-neutral-500">
						Tap and hold to copy the code, then paste it in the app
					</Text>
				{/if}
			</Section>

			<Text class="text-sm leading-6 text-black">
				This code will expire in 15 minutes for security reasons.
			</Text>
			<Text class="text-sm leading-6 text-neutral-600">
				If you didn't request this code, you can safely ignore this email.
			</Text>
			<Footer />
		</Container>
	</Body>
</Html>
