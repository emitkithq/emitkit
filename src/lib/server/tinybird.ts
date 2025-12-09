import { TINYBIRD_TOKEN, TINYBIRD_API_URL } from '$env/static/private';

const TINYBIRD_BASE_URL = TINYBIRD_API_URL || 'https://api.tinybird.co';

export interface TinybirdEvent {
	id: string;
	channel_id: string;
	project_id: string;
	organization_id: string;
	retention_tier: string; // 'basic' | 'premium' | 'unlimited'
	title: string;
	description?: string;
	icon?: string;
	tags: string[];
	metadata: Record<string, unknown>;
	user_id?: string;
	notify: boolean;
	display_as: string;
	source: string;
	created_at: string; // ISO 8601 timestamp
}

export interface TinybirdIngestResponse {
	successful_rows: number;
	quarantined_rows: number;
}

class TinybirdClient {
	private token: string;
	private baseUrl: string;

	constructor(token: string, baseUrl: string = TINYBIRD_BASE_URL) {
		this.token = token;
		this.baseUrl = baseUrl;
	}

	/**
	 * Ingest a single event into Tinybird
	 *
	 * @param event - Event data matching TinybirdEvent schema
	 * @param wait - If true, waits for data to be committed before responding (slower but guaranteed)
	 * @returns Promise with ingestion response
	 */
	async ingestEvent(event: TinybirdEvent, wait: boolean = false): Promise<TinybirdIngestResponse> {
		const url = `${this.baseUrl}/v0/events?name=events${wait ? '&wait=true' : ''}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(event)
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Tinybird ingestion failed: ${response.status} ${error}`);
		}

		return response.json();
	}

	/**
	 * Ingest multiple events in a single batch
	 *
	 * @param events - Array of events to ingest
	 * @param wait - If true, waits for data to be committed before responding
	 * @returns Promise with ingestion response
	 */
	async ingestEventBatch(
		events: TinybirdEvent[],
		wait: boolean = false
	): Promise<TinybirdIngestResponse> {
		const url = `${this.baseUrl}/v0/events?name=events${wait ? '&wait=true' : ''}`;

		// NDJSON format (one JSON object per line)
		const ndjson = events.map((e) => JSON.stringify(e)).join('\n');

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/x-ndjson'
			},
			body: ndjson
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Tinybird batch ingestion failed: ${response.status} ${error}`);
		}

		return response.json();
	}

	/**
	 * Ingest data into a specific datasource
	 *
	 * @param datasourceName - Name of the datasource (e.g., 'events', 'user_identities')
	 * @param data - Data to ingest (single object or array)
	 * @param wait - If true, waits for data to be committed before responding
	 * @returns Promise with ingestion response
	 */
	async ingestToDatasource(
		datasourceName: string,
		data: unknown,
		wait: boolean = false
	): Promise<TinybirdIngestResponse> {
		const url = `${this.baseUrl}/v0/events?name=${datasourceName}${wait ? '&wait=true' : ''}`;

		const body = Array.isArray(data)
			? data.map((item) => JSON.stringify(item)).join('\n')
			: JSON.stringify(data);

		const contentType = Array.isArray(data) ? 'application/x-ndjson' : 'application/json';

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': contentType
			},
			body
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Tinybird ingestion failed: ${response.status} ${error}`);
		}

		return response.json();
	}

	/**
	 * Query a Tinybird pipe (API endpoint)
	 *
	 * @param pipeName - Name of the pipe to query
	 * @param params - Query parameters
	 * @param format - Response format (json, csv, parquet, etc.)
	 * @returns Promise with query results
	 */
	async queryPipe<T = unknown>(
		pipeName: string,
		params: Record<string, string | number | boolean> = {},
		format: 'json' | 'csv' | 'ndjson' = 'json'
	): Promise<T> {
		const queryString = new URLSearchParams(
			Object.entries(params).reduce(
				(acc, [key, value]) => {
					acc[key] = String(value);
					return acc;
				},
				{} as Record<string, string>
			)
		).toString();

		const url = `${this.baseUrl}/v0/pipes/${pipeName}.${format}${queryString ? `?${queryString}` : ''}`;

		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${this.token}`
			}
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Tinybird query failed: ${response.status} ${error}`);
		}

		if (format === 'json') {
			return response.json();
		}

		return response.text() as T;
	}

	/**
	 * Query a Tinybird pipe with POST (for larger parameter sets)
	 *
	 * @param pipeName - Name of the pipe to query
	 * @param params - Query parameters
	 * @returns Promise with query results
	 */
	async queryPipePost<T = unknown>(
		pipeName: string,
		params: Record<string, unknown> = {}
	): Promise<T> {
		const url = `${this.baseUrl}/v0/pipes/${pipeName}.json`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(params)
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Tinybird query failed: ${response.status} ${error}`);
		}

		return response.json();
	}

	/**
	 * Execute a SQL query directly against Tinybird
	 * Note: Only supports SELECT and DESCRIBE queries
	 *
	 * @param sql - SQL query to execute
	 * @returns Promise with query results
	 */
	async executeSQL<T = unknown>(sql: string): Promise<T> {
		const url = `${this.baseUrl}/v0/sql`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: `q=${encodeURIComponent(sql)}`
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Tinybird SQL execution failed: ${response.status} ${error}`);
		}

		return response.json();
	}

	/**
	 * Delete data from a datasource based on a condition
	 * Uses the Data Sources API delete endpoint
	 *
	 * @param datasourceName - Name of the datasource
	 * @param deleteCondition - SQL WHERE clause condition (e.g., "id='123' AND org_id='456'")
	 * @returns Promise with job information
	 */
	async deleteData(
		datasourceName: string,
		deleteCondition: string
	): Promise<{ id: string; job_id: string; status: string; delete_condition: string }> {
		const url = `${this.baseUrl}/v0/datasources/${datasourceName}/delete`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: `delete_condition=${encodeURIComponent(deleteCondition)}`
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Tinybird delete failed: ${response.status} ${error}`);
		}

		return response.json();
	}
}

export const tinybird = new TinybirdClient(TINYBIRD_TOKEN);

export function isTinybirdEnabled(): boolean {
	return Boolean(TINYBIRD_TOKEN);
}
