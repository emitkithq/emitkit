import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parse } from 'yaml';

// Import the YAML file as a raw string at build time
// Vite will bundle this, making it available in serverless environments
import openapiYaml from '../../../../openapi/openapi.yaml?raw';

let cachedSpec: object | null = null;

/**
 * Serves the OpenAPI specification in JSON format
 * This allows tools like Mintlify, Postman, and SDK generators to consume the spec
 */
export const GET: RequestHandler = async () => {
	try {
		// Cache the parsed spec to avoid re-parsing on every request
		if (!cachedSpec) {
			cachedSpec = parse(openapiYaml);
		}

		return json(cachedSpec, {
			headers: {
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
				'Access-Control-Allow-Origin': '*' // Allow CORS for tools
			}
		});
	} catch (error) {
		return json(
			{
				error: 'Failed to load OpenAPI specification',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{
				status: 500
			}
		);
	}
};
