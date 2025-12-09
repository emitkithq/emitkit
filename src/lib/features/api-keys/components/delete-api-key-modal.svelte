<script lang="ts">
	import type { StackItemProps } from '@svelte-put/async-stack';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import { authClient } from '$lib/client/auth/auth-client';

	interface Props {
		keyId: string;
		keyName: string;
		partialKey: string;
	}

	let { item, keyId, keyName, partialKey }: StackItemProps<{ success: boolean }> & Props = $props();

	let isDeleting = $state(false);

	async function handleDelete() {
		isDeleting = true;

		try {
			const { data, error } = await authClient.apiKey.delete({
				keyId
			});

			if (error || !data.success) {
				throw error;
			}

			toast.success('API key deleted successfully');
			item.resolve({ success: true });
		} catch (error) {
			console.error('Failed to delete API key:', error);
			toast.error('Failed to delete API key');
			item.resolve({ success: false });
		} finally {
			isDeleting = false;
		}
	}

	function handleCancel() {
		item.resolve({ success: false });
	}
</script>

<Dialog.Root open={true}>
	<Dialog.Content class="sm:max-w-[450px]">
		<Dialog.Header>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive"
				>
					<AlertTriangleIcon class="h-5 w-5" />
				</div>
				<div>
					<Dialog.Title>Delete API Key</Dialog.Title>
				</div>
			</div>
			<Dialog.Description>
				Are you sure you want to delete this API key? This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="rounded-lg bg-muted p-4">
				<div class="space-y-2">
					<div>
						<p class="text-sm font-medium">Key Name</p>
						<p class="text-sm text-muted-foreground">{keyName}</p>
					</div>
					<div>
						<p class="text-sm font-medium">Key</p>
						<code class="text-xs text-muted-foreground">{partialKey}</code>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-destructive/10 p-4">
				<p class="text-sm font-medium text-destructive">⚠️ Warning</p>
				<p class="mt-1 text-xs text-destructive/80">
					Any applications using this key will immediately lose API access.
				</p>
			</div>
		</div>

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={handleCancel} disabled={isDeleting}>
				Cancel
			</Button>
			<Button type="button" variant="destructive" onclick={handleDelete} disabled={isDeleting}>
				{isDeleting ? 'Deleting...' : 'Delete API Key'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
