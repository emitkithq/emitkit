export function match(value: string): boolean {
	// Site starts with "site_" followed by alphanumeric characters

	const siteIdPattern = /^site_[a-zA-Z0-9]+$/;

	return siteIdPattern.test(value);
}
