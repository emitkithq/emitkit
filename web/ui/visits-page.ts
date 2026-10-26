import { trackPageView } from "@ui/visits";

/**
 * The site's and docs' page-view script (`/www/ek.js`), which the Worker adds
 * to their pages only when operator telemetry is set up. The docs (Astro's
 * client router) swap pages without a reload and announce each one.
 */
trackPageView();
document.addEventListener("astro:page-load", trackPageView);
