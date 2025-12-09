<script lang="ts">
	import FolderIcon from '@lucide/svelte/icons/folder';
	import { getFaviconUrl } from '$lib/utils/url';

	interface Props {
		url?: string | null;
		fallbackIcon?: string | null;
		size?: 'sm' | 'md' | 'lg';
	}

	let { url = null, fallbackIcon = null, size = 'md' }: Props = $props();

	// Derive image URL
	const imageUrl = $derived(getFaviconUrl(url));

	// State management
	let imageState = $state<'loading' | 'success' | 'error'>('loading');
	let imgElement = $state<HTMLImageElement | null>(null);

	// Size mappings
	const sizeClasses = {
		sm: 'size-4',
		md: 'size-5',
		lg: 'size-6'
	};

	const containerSizes = {
		sm: 'size-4',
		md: 'size-5',
		lg: 'size-6'
	};

	// Handle image load and error
	function handleImageLoad() {
		imageState = 'success';
	}

	function handleImageError() {
		imageState = 'error';
	}

	// Reset state when URL changes
	$effect(() => {
		if (imageUrl) {
			imageState = 'loading';
		} else {
			imageState = 'error';
		}
	});
</script>

{#if imageUrl && (imageState === 'loading' || imageState === 'success')}
	<div class="relative flex items-center justify-center {containerSizes[size]}">
		<!-- Skeleton loader -->
		{#if imageState === 'loading'}
			<div class="absolute inset-0 animate-pulse rounded bg-muted"></div>
		{/if}

		<!-- Image -->
		<img
			bind:this={imgElement}
			src={imageUrl}
			alt="Folder favicon"
			class="rounded {sizeClasses[size]} {imageState === 'loading'
				? 'opacity-0'
				: 'opacity-100'} transition-opacity duration-200"
			onload={handleImageLoad}
			onerror={handleImageError}
			loading="lazy"
		/>
	</div>
{:else if fallbackIcon}
	<!-- Fallback icon (emoji) -->
	<span
		class="flex items-center justify-center {containerSizes[size]} text-{size === 'sm'
			? 'xs'
			: size === 'md'
				? 'sm'
				: 'base'}"
	>
		{fallbackIcon}
	</span>
{:else}
	<!-- Default folder icon -->
	<FolderIcon class={sizeClasses[size]} />
{/if}
