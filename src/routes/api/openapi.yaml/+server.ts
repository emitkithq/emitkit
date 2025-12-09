import type { RequestHandler } from './$types';

// Import the YAML file as a raw string at build time
// Vite will bundle this, making it available in serverless environments
import openapiYaml from '../../../../openapi/openapi.yaml?raw';

/**
 * Serves the OpenAPI specification in YAML format
 * This is the canonical source format
 */
export const GET: RequestHandler = async () => {
	try {
		return new Response(openapiYaml, {
			headers: {
				'Content-Type': 'text/yaml',
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
				'Access-Control-Allow-Origin': '*' // Allow CORS for tools
			}
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: 'Failed to load OpenAPI specification',
				message: error instanceof Error ? error.message : 'Unknown error'
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);
	}
};
