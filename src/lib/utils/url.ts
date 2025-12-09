/**
 * Extract domain from a URL
 * @param url - The website URL
 * @returns The domain (hostname) or null if invalid
 */
function extractDomain(url: string): string | null {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		return null;
	}
}

/**
 * Generate a favicon URL for a given website URL using the metadata service
 * @param url - The website URL
 * @param size - The desired icon size (default: 32)
 * @returns The favicon URL or null if no URL provided
 */
export function getFaviconUrl(url: string | null | undefined, size: number = 32): string | null {
	if (!url) return null;

	const domain = extractDomain(url);
	if (!domain) return null;

	return `https://metadata.stacksee.com/${domain}?s=${size}`;
}
