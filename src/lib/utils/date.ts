/**
 * Format a date as relative time (e.g., "2 days ago", "3 hours ago")
 */
export function formatRelativeTime(date: Date | string | null): string {
	if (!date) return 'Unknown';

	const dateObj = typeof date === 'string' ? new Date(date) : date;
	const now = new Date();
	const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

	if (diffInSeconds < 60) {
		return 'just now';
	}

	const diffInMinutes = Math.floor(diffInSeconds / 60);
	if (diffInMinutes < 60) {
		return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
	}

	const diffInHours = Math.floor(diffInMinutes / 60);
	if (diffInHours < 24) {
		return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
	}

	const diffInDays = Math.floor(diffInHours / 24);
	if (diffInDays < 30) {
		return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
	}

	const diffInMonths = Math.floor(diffInDays / 30);
	if (diffInMonths < 12) {
		return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
	}

	const diffInYears = Math.floor(diffInMonths / 12);
	return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
}

/**
 * Format salary range
 */
export function formatSalaryRange(
	min: number | null,
	max: number | null,
	currency: string | null = 'USD',
	period: string | null = 'year'
): string | null {
	if (!min && !max) return null;

	const currencySymbol = currency === 'USD' ? '$' : currency || '$';
	const periodLabel = period === 'year' ? '/year' : period === 'month' ? '/month' : '/hour';

	const formatNumber = (num: number) => {
		return new Intl.NumberFormat('en-US').format(num);
	};

	if (min && max) {
		return `${currencySymbol}${formatNumber(min)} - ${currencySymbol}${formatNumber(max)}${periodLabel}`;
	} else if (min) {
		return `${currencySymbol}${formatNumber(min)}+${periodLabel}`;
	} else if (max) {
		return `Up to ${currencySymbol}${formatNumber(max)}${periodLabel}`;
	}

	return null;
}
