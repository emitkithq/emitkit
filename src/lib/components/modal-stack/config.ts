import { stack } from '@svelte-put/async-stack';
import { ChannelModal } from '$lib/features/channels/components/channel-modal';
import { NotificationPromptModal } from '$lib/features/notifications/components';
import { CreateProjectModal } from '$lib/features/projects/components/create-project-modal';
import { EditProjectModal } from '$lib/features/projects/components/edit-project-modal';
import { DeleteProjectModal } from '$lib/features/projects/components/delete-project-modal';
import { RestoreProjectModal } from '$lib/features/projects/components/restore-project-modal';
import CreateApiKeyModal from '$lib/features/api-keys/components/create-api-key-modal.svelte';
import DeleteApiKeyModal from '$lib/features/api-keys/components/delete-api-key-modal.svelte';

export const modalStack = stack()
	.addVariant('channel', ChannelModal)
	.addVariant('notificationPrompt', NotificationPromptModal)
	.addVariant('createProject', CreateProjectModal)
	.addVariant('editProject', EditProjectModal)
	.addVariant('deleteProject', DeleteProjectModal)
	.addVariant('restoreProject', RestoreProjectModal)
	.addVariant('createApiKey', CreateApiKeyModal)
	.addVariant('deleteApiKey', DeleteApiKeyModal)
	.build();

export type ModalStack = typeof modalStack;
