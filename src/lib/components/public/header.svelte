<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Action } from 'svelte/action';
	import type { Snippet } from 'svelte';
	import Logo from '$lib/components/logo.svelte';
	import ThemeSwitcher from '$lib/components/theme-switcher.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import { navigationMenuTriggerStyle } from '$lib/components/ui/navigation-menu/navigation-menu-trigger.svelte';
	import { cn } from '$lib/utils/ui.js';
	import { Container } from '$lib/components/ui/container/index.js';
	import { authRoutes } from '$lib/utils/navigation';
	import { useSiteConfig } from '$lib/hooks/use-site-config.svelte';
	import { animate } from 'motion';
	import { tv, type VariantProps } from 'tailwind-variants';

	const config = useSiteConfig();

	const headerVariants = tv({
		slots: {
			base: 'sticky top-0 right-0 left-0 z-40 flex items-center bg-background transition-all duration-300',
			container: 'w-full flex items-center transition-all duration-300',
			logo: 'transition-all duration-300',
			nav: 'hidden md:block',
			actions: 'flex items-center gap-4'
		},
		variants: {
			variant: {
				default: {
					container: 'justify-between',
					logo: '',
					nav: 'hidden md:block'
				},
				minimal: {
					container: 'justify-between',
					logo: '',
					nav: 'hidden'
				}
			},
			logoPosition: {
				left: {
					container: 'justify-start',
					logo: ''
				},
				center: {
					container: 'justify-center',
					logo: 'absolute left-1/2 -translate-x-1/2'
				}
			},
			sticky: {
				true: {
					base: 'h-12 xl:h-14 shadow backdrop-blur-xl backdrop-saturate-150 border-b border-border/40',
					container: 'py-2'
				},
				false: {
					base: 'h-14 xl:h-16',
					container: 'py-4'
				}
			}
		},
		defaultVariants: {
			variant: 'default',
			sticky: false,
			logoPosition: 'left'
		}
	});

	type HeaderVariant = VariantProps<typeof headerVariants>['variant'];

	type HeaderProps = {
		variant?: HeaderVariant;
		rightActions?: Snippet;
	};

	let { variant = 'default', rightActions }: HeaderProps = $props();

	type ListItemProps = HTMLAttributes<HTMLAnchorElement> & {
		title: string;
		href: string;
		content: string;
	};

	const resources: { title: string; href: string; description: string }[] = [
		{
			title: 'Technologies',
			href: '/stack',
			description: 'Browse technologies we detect.'
		}
	];

	let isSticky = $state(false);
	const SCROLL_THRESHOLD = 50; // Pixels to scroll before header becomes sticky

	// Determine logo position based on variant and presence of right actions
	const logoPosition = $derived(variant === 'minimal' && rightActions ? 'center' : 'left');

	const styles = $derived(headerVariants({ variant, sticky: isSticky, logoPosition }));

	/**
	 * Svelte action for sticky header with smooth animations
	 */
	const stickyHeader: Action<HTMLElement> = (node: HTMLElement) => {
		const handleScroll = () => {
			const currentScrollY = window.scrollY;

			// Determine if we should be in sticky state
			const shouldBeSticky = currentScrollY > SCROLL_THRESHOLD;

			// Only update if state changed
			if (shouldBeSticky !== isSticky) {
				isSticky = shouldBeSticky;

				// Animate header when becoming sticky
				if (shouldBeSticky) {
					// Subtle entrance animation when sticky becomes active
					animate(
						node,
						{
							opacity: [0.95, 1],
							y: [-8, 0]
						},
						{
							duration: 0.3,
							ease: [0.16, 1, 0.3, 1] // Smooth ease out
						}
					);
				}
			}
		};

		// Add scroll listener with passive flag for better performance
		window.addEventListener('scroll', handleScroll, { passive: true });

		// Check initial scroll position
		handleScroll();

		return {
			destroy() {
				window.removeEventListener('scroll', handleScroll);
			}
		};
	};
</script>

{#snippet ListItem({ title, content, href, class: className, ...restProps }: ListItemProps)}
	<li>
		<NavigationMenu.Link>
			{#snippet child()}
				<a
					{href}
					class={cn(
						'block space-y-1 rounded-md p-3 leading-none no-underline transition-colors outline-none select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
						className
					)}
					{...restProps}
				>
					<div class="text-sm leading-none font-medium">{title}</div>
					<p class="line-clamp-2 text-sm leading-snug text-muted-foreground">
						{content}
					</p>
				</a>
			{/snippet}
		</NavigationMenu.Link>
	</li>
{/snippet}

<header use:stickyHeader class={styles.base()}>
	<Container>
		<div class={cn(styles.container(), logoPosition === 'center' && 'relative')}>
			<!-- Left side: Logo and Navigation -->
			<div class="flex items-center gap-8">
				<!-- Mobile Menu (shown on mobile only) -->
				<div class="md:hidden">
					<!-- Empty for now -->
				</div>

				<div class={styles.logo()}>
					<Logo />
				</div>

				{#if variant === 'default'}
					<NavigationMenu.Root class={styles.nav()}>
						<NavigationMenu.List>
							<NavigationMenu.Item>
								<NavigationMenu.Link>
									{#snippet child()}
										<a href="/" class={navigationMenuTriggerStyle()}> Features </a>
									{/snippet}
								</NavigationMenu.Link>
							</NavigationMenu.Item>

							<NavigationMenu.Item>
								<NavigationMenu.Link>
									{#snippet child()}
										<a href="/pricing" class={navigationMenuTriggerStyle()}> Pricing </a>
									{/snippet}
								</NavigationMenu.Link>
							</NavigationMenu.Item>

							<NavigationMenu.Item>
								<NavigationMenu.Trigger>Resources</NavigationMenu.Trigger>
								<NavigationMenu.Content>
									<ul class="grid gap-3 p-2 sm:w-[200px] md:w-[300px]">
										{#each resources as resource, i (i)}
											{@render ListItem({
												href: resource.href,
												title: resource.title,
												content: resource.description
											})}
										{/each}
									</ul>
								</NavigationMenu.Content>
							</NavigationMenu.Item>
						</NavigationMenu.List>
					</NavigationMenu.Root>
				{/if}
			</div>

			<!-- Right side: Custom actions or default actions -->
			{#if rightActions}
				<div class={cn(styles.actions(), logoPosition === 'center' && 'relative z-10')}>
					{@render rightActions()}
				</div>
			{:else if variant === 'default'}
				<div class={styles.actions()}>
					{#if config.flags.darkMode}
						<ThemeSwitcher class="hidden md:inline-flex" />
					{/if}

					<Button
						href={authRoutes.signIn()}
						variant="ghost"
						class="hidden md:inline-flex"
						size="sm"
					>
						Sign in
					</Button>

					<Button
						href={authRoutes.getStarted()}
						variant="default"
						class="hidden sm:inline-flex"
						size="sm"
					>
						Sign up
					</Button>
				</div>
			{/if}
		</div>
	</Container>
</header>
