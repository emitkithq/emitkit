<script lang="ts">
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/inter/700.css';
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { AuthUIProvider } from 'better-auth-ui-svelte';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { authClient } from '$lib/client/auth/auth-client';
	import { toast, Toaster } from 'svelte-sonner';
	import { setSiteConfig, useSiteConfig } from '$lib/hooks/use-site-config.svelte';
	import ModalStackProvider from '$lib/components/modal-stack/modal-stack-provider.svelte';
	import PwaInstall from '$lib/components/pwa/pwa-install.svelte';
	import { onMount } from 'svelte';
	import { authPathConfig } from '$lib/client/auth/auth-config.js';

	let { data, children } = $props();

	// Set site config immediately (before useSiteConfig is called)
	// This intentionally captures the initial value to set context before children render
	// The warning about capturing initial value is expected - we want both initial set and reactive updates
	// svelte-ignore state_referenced_locally
	setSiteConfig(data.config);
	const config = useSiteConfig();

	// Update site config reactively when data changes
	$effect(() => {
		setSiteConfig(data.config);
	});

	// Register service worker via vite-pwa
	onMount(async () => {
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({
			immediate: true,
			onNeedRefresh() {
				toast.info('New version available!', {
					description: 'Refresh to get the latest features and fixes.',
					duration: Infinity,
					action: {
						label: 'Refresh',
						onClick: () => {
							// updateSW triggers skipWaiting + reload
							registerSW({ immediate: true });
							window.location.reload();
						}
					},
					cancel: {
						label: 'Later',
						onClick: () => {
							// User can continue with old version
						}
					}
				});
			},
			onRegisteredSW(swUrl, registration) {
				if (registration) {
					// Check for updates every 60 seconds
					setInterval(() => {
						registration.update();
					}, 60000);
				}
			}
		});
	});
</script>

{#if config.flags.darkMode}
	<ModeWatcher />
{/if}

<Toaster />

<!-- PWA Install prompt -->
<PwaInstall manifestUrl="/manifest.webmanifest" useLocalStorage={true} />

<QueryClientProvider client={data.queryClient}>
	<AuthUIProvider
		{authClient}
		credentials={true}
		emailOTP={true}
		{toast}
		basePath={authPathConfig.basePath}
		viewPaths={authPathConfig.viewPaths}
		organization={true}
	>
		<ModalStackProvider>
			{@render children()}
		</ModalStackProvider>
	</AuthUIProvider>
</QueryClientProvider>
