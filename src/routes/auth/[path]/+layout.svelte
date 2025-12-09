<script lang="ts">
	import { authViewPaths } from 'better-auth-ui-svelte';
	import Logo from '$lib/components/logo.svelte';
	import type { LayoutProps } from './$types.js';

	let { children, params }: LayoutProps = $props();

	const isSplitLayout = $derived(
		[
			authViewPaths.SIGN_IN,
			authViewPaths.SIGN_UP,
			authViewPaths.FORGOT_PASSWORD,
			authViewPaths.RESET_PASSWORD,
			authViewPaths.MAGIC_LINK,
			authViewPaths.EMAIL_OTP
		].includes(params.path ?? '')
	);
</script>

{#if isSplitLayout}
	<div class="grid max-h-screen min-h-svh lg:grid-cols-2">
		<div class="flex flex-col gap-4 p-6 md:p-10">
			<Logo class="flex h-6 justify-center gap-2 md:justify-start" href="/" />

			<div class="flex flex-1 items-center justify-center">
				{@render children()}
			</div>
		</div>
		<div class="relative hidden bg-muted lg:block">
			<img
				src="/public/auth-screen.jpg"
				alt="Lighthouse on beach"
				class="absolute inset-0 h-full w-full object-cover brightness-[0.35] dark:brightness-[0.2] dark:grayscale"
			/>
			<div class="absolute inset-0 flex items-end justify-start p-12">
				<div class="max-w-xs space-y-4 text-white drop-shadow-lg">
					<h2 class="text-3xl font-semibold tracking-tight">
						Simple insights, delivered instantly<span class="relative ml-2 inline-flex h-3 w-3">
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"
							></span>
							<span class="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
						</span>
					</h2>
					<p class="text-lg text-white/90">Send events. Get them on your devices. No fuss.</p>
				</div>
			</div>
		</div>
	</div>
{:else}
	{@render children()}
{/if}
