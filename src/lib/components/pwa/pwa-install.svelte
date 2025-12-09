<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		/**
		 * Manually control when to show the dialog on Apple devices
		 */
		manualApple?: boolean;
		/**
		 * Manually control when to show the dialog on Chrome
		 */
		manualChrome?: boolean;
		/**
		 * Disable Chrome-specific install logic (use browser's default)
		 */
		disableChrome?: boolean;
		/**
		 * Disable the close button on the dialog
		 */
		disableClose?: boolean;
		/**
		 * Store user preference in localStorage to not prompt again
		 */
		useLocalStorage?: boolean;
		/**
		 * Custom installation description text
		 */
		installDescription?: string;
		/**
		 * Disable the installation description
		 */
		disableInstallDescription?: boolean;
		/**
		 * Disable screenshots in the dialog
		 */
		disableScreenshots?: boolean;
		/**
		 * Disable screenshots on Apple devices
		 */
		disableScreenshotsApple?: boolean;
		/**
		 * Disable screenshots on Chrome
		 */
		disableScreenshotsChrome?: boolean;
		/**
		 * Disable fallback instructions for non-Chrome Android browsers
		 */
		disableAndroidFallback?: boolean;
		/**
		 * Path to manifest.json (if different from default)
		 */
		manifestUrl?: string;
	}

	let {
		manualApple = false,
		manualChrome = false,
		disableChrome = false,
		disableClose = false,
		useLocalStorage = true,
		installDescription,
		disableInstallDescription = false,
		disableScreenshots = false,
		disableScreenshotsApple = false,
		disableScreenshotsChrome = false,
		disableAndroidFallback = false,
		manifestUrl
	}: Props = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let pwaInstallElement: any;

	onMount(async () => {
		if (!browser) return;

		// Import the web component
		await import('@khmyznikov/pwa-install');

		// Setup event listeners for PWA install events
		if (pwaInstallElement) {
			pwaInstallElement.addEventListener('pwa-install-success-event', (event: CustomEvent) => {
				console.log('✅ PWA installed successfully:', event.detail.message);
			});

			pwaInstallElement.addEventListener('pwa-install-fail-event', (event: CustomEvent) => {
				console.log('❌ PWA installation failed:', event.detail.message);
			});

			pwaInstallElement.addEventListener('pwa-install-available-event', () => {
				console.log('📲 PWA installation available');
			});

			pwaInstallElement.addEventListener('pwa-user-choice-result-event', (event: CustomEvent) => {
				console.log('👤 User choice result:', event.detail.message);
			});
		}
	});

	/**
	 * Manually trigger the install dialog
	 */
	export function showDialog() {
		if (pwaInstallElement) {
			pwaInstallElement.showDialog();
		}
	}

	/**
	 * Hide the install dialog
	 */
	export function hideDialog() {
		if (pwaInstallElement) {
			pwaInstallElement.hideDialog();
		}
	}

	/**
	 * Trigger the install flow
	 */
	export function install() {
		if (pwaInstallElement) {
			pwaInstallElement.install();
		}
	}
</script>

<pwa-install
	bind:this={pwaInstallElement}
	manual-apple={manualApple || undefined}
	manual-chrome={manualChrome || undefined}
	disable-chrome={disableChrome || undefined}
	disable-close={disableClose || undefined}
	use-local-storage={useLocalStorage || undefined}
	install-description={installDescription}
	disable-install-description={disableInstallDescription || undefined}
	disable-screenshots={disableScreenshots || undefined}
	disable-screenshots-apple={disableScreenshotsApple || undefined}
	disable-screenshots-chrome={disableScreenshotsChrome || undefined}
	disable-android-fallback={disableAndroidFallback || undefined}
	manifest-url={manifestUrl}
></pwa-install>
