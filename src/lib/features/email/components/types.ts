export type EmailVacancy = {
	id: string;
	title: string;
	company: {
		image?: string;
		name: string;
	};
	description: string;
	url: string;
};

export interface JobNewsletterEmailProps extends Record<string, unknown> {
	latestVacancies: EmailVacancy[];
	featuredVacancies?: EmailVacancy[];
	unsubscribeUrl: string;
}

export type EmailButtonProps = {
	href: string;
	label: string;
};
