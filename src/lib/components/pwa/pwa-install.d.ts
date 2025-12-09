// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare namespace svelteHTML {
	interface IntrinsicElements {
		'pwa-install': {
			'manual-apple'?: boolean;
			'manual-chrome'?: boolean;
			'disable-chrome'?: boolean;
			'disable-close'?: boolean;
			'use-local-storage'?: boolean;
			'install-description'?: string;
			'disable-install-description'?: boolean;
			'disable-screenshots'?: boolean;
			'disable-screenshots-apple'?: boolean;
			'disable-screenshots-chrome'?: boolean;
			'disable-android-fallback'?: boolean;
			'manifest-url'?: string;
			name?: string;
			description?: string;
			icon?: string;
		};
	}
}

export {};
