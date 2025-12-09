import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import postgres from 'postgres';
import { neonConfig, Pool } from '@neondatabase/serverless';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import ws from 'ws';
import { createLogger } from '$lib/server/logger';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// Auto-detect if we're in a serverless environment (Vercel, AWS Lambda, etc.)
const isServerless = env.USE_NEON_SERVERLESS === 'true' || process.env.VERCEL === '1';

const logger = createLogger('database');

const createDb = () => {
	if (isServerless) {
		// Production: Use Neon serverless driver with WebSocket support
		logger.info('Using Neon serverless database driver', {
			driver: 'neon-serverless',
			environment: 'serverless'
		});

		// Configure Neon to use WebSockets in Node.js environment
		neonConfig.webSocketConstructor = ws;

		// Create connection pool
		const pool = new Pool({ connectionString: env.DATABASE_URL });

		return drizzleNeon(pool, { schema });
	} else {
		// Development: Use standard postgres-js driver
		logger.info('Using postgres-js database driver', {
			driver: 'postgres-js',
			environment: 'local-development'
		});

		const client = postgres(env.DATABASE_URL);
		return drizzlePg(client, { schema });
	}
};

export const db = createDb();

export { schema };
export * from './schema';
