<script lang="ts">
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/inter/700.css';
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { AuthUIProvider } from 'better-auth-ui-svelte';
	import { authClient } from '$lib/client/auth/auth-client';
	import { toast, Toaster } from 'svelte-sonner';
	import { setSiteConfig, useSiteConfig } from '$lib/hooks/use-site-config.svelte';
	import ModalStackProvider from '$lib/components/modal-stack/modal-stack-provider.svelte';
	import PwaInstall from '$lib/components/pwa/pwa-install.svelte';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
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

	// Register service worker for PWA functionality
	onMount(() => {
		if ('serviceWorker' in navigator && !dev) {
			navigator.serviceWorker
				.register('/service-worker.js')
				.then((registration) => {
					console.log('Service Worker registered:', registration);

					// Check for updates every 60 seconds (when app is active)
					setInterval(() => {
						registration.update();
					}, 60000);
				})
				.catch((error) => {
					console.error('Service Worker registration failed:', error);
				});

			// Listen for update notifications from service worker
			navigator.serviceWorker.addEventListener('message', (event) => {
				if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
					// Show toast with update prompt
					toast.info('New version available!', {
						description: 'Refresh to get the latest features and fixes.',
						duration: Infinity, // Don't auto-dismiss
						action: {
							label: 'Refresh',
							onClick: () => {
								// Tell the waiting service worker to activate
								const waitingSW = navigator.serviceWorker.controller;
								if (waitingSW) {
									navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
								}
								// Reload the page once the new SW takes over
								navigator.serviceWorker.addEventListener('controllerchange', () => {
									window.location.reload();
								});
							}
						},
						cancel: {
							label: 'Later',
							onClick: () => {
								// User can continue with old version
							}
						}
					});
				}
			});
		}
	});
</script>

{#if config.flags.darkMode}
	<ModeWatcher />
{/if}

<Toaster />

<!-- PWA Install prompt -->
<PwaInstall manifestUrl="/manifest.webmanifest" useLocalStorage={true} />

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
