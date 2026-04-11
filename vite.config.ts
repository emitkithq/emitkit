import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'sw.ts',
			manifest: {
				short_name: 'EmitKit',
				name: 'EmitKit - Real-time Event Notifications',
				description: 'Receive real-time event notifications on your phone',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				theme_color: '#090714',
				background_color: '#282154',
				icons: [
					{
						src: '/web-app-manifest-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable'
					},
					{
						src: '/web-app-manifest-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
			devOptions: {
				enabled: false
			}
		}),
		devtoolsJson()
	],
	define: {
		// Expose Vercel deployment ID for cache busting
		// Uses commit SHA in production, timestamp in development
		__DEPLOYMENT_ID__: JSON.stringify(
			process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || `dev-${Date.now()}`
		)
	},
	// Fix for @xyflow/svelte importing Node.js modules (source-map-js, url)
	ssr: {
		noExternal: ['@xyflow/svelte']
	},
	optimizeDeps: {
		include: ['@xyflow/svelte']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
