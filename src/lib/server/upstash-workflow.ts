import { Client } from '@upstash/workflow';
import { QSTASH_TOKEN, QSTASH_URL } from '$env/static/private';
import { siteConfig } from './site-config';

export const workflowClient = new Client({
	baseUrl: QSTASH_URL,
	token: QSTASH_TOKEN
});

export function getWorkflowEndpoint(workflowId: string): string {
	const baseUrl = siteConfig.appUrl;
	return `${baseUrl}/api/workflows/${workflowId}/execute`;
}
