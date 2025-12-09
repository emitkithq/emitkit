/**
 * Converts a string to a URL-friendly slug
 *
 * @param text - The text to slugify
 * @returns A lowercase slug with only letters, numbers, and hyphens
 *
 * @example
 * slugify("Hello World") // "hello-world"
 * slugify("User Events") // "user-events"
 * slugify("API Requests") // "api-requests"
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '') // Remove special characters
		.replace(/[\s_-]+/g, '-') // Replace spaces, underscores with single hyphen
		.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}
