<script lang="ts">
	import { Container } from '$lib/components/ui/container';
	import { Wrapper } from '$lib/components/ui/wrapper';
	import { cn } from '$lib/utils/ui';
</script>

<footer class="mt-auto w-full border-t bg-card">
	<Container>
		{#snippet child({ props })}
			<Wrapper class={cn('py-fluid-lg', props.class)}>
				<!-- Main Footer Content -->
				<div
					class="flex w-full flex-col items-start gap-x-6 gap-y-fluid-md md:grid md:grid-cols-3 lg:gap-x-8"
				>
					<!-- Brand Section -->
					<div class="flex flex-col gap-y-4 md:col-span-2">
						<div class="flex flex-col gap-y-2">
							<h2 class="text-lg font-semibold">Stacksee</h2>
							<p class="max-w-md text-sm text-muted-foreground">
								Discover and explore the technology stacks behind your favorite websites and
								applications.
							</p>
						</div>
					</div>

					<!-- Quick Links -->
					<div class="flex flex-col gap-y-4">
						<h3 class="text-sm font-semibold">Quick Links</h3>
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<nav class="flex flex-col gap-y-2 text-sm">
							<a href="/" class="text-muted-foreground transition-colors hover:text-foreground">
								Home
							</a>
							<a
								href="/stacks"
								class="text-muted-foreground transition-colors hover:text-foreground"
							>
								Browse Technologies
							</a>
							<a
								href="/about"
								class="text-muted-foreground transition-colors hover:text-foreground"
							>
								About
							</a>
							<a
								href="/contact"
								class="text-muted-foreground transition-colors hover:text-foreground"
							>
								Contact
							</a>
						</nav>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
				</div>
			</Wrapper>
		{/snippet}
	</Container>
</footer>
