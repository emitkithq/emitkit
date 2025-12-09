class BreadcrumbsState {
	showBreadcrumbs = $state(true);

	hideBreadcrumbs() {
		this.showBreadcrumbs = false;
	}

	viewBreadcrumbs() {
		this.showBreadcrumbs = true;
	}
}

const breadcrumbsState = new BreadcrumbsState();

export const useBreadcrumbs = () => breadcrumbsState;
