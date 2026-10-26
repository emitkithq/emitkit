import { DEFAULT_APP_ORIGIN } from "@www/site";
import { useSyncExternalStore } from "react";

/**
 * The dashboard lives on the `app.` subdomain of whichever host serves this
 * site: emitkit.com → https://app.emitkit.com, localhost:5173 →
 * http://app.localhost:5173.
 */
export const appOriginFor = ({
  host,
  protocol,
}: Pick<Location, "host" | "protocol">) =>
  `${protocol}//app.${host.replace(/^www\./u, "")}`;

const subscribe = () => () => {
  // The origin never changes while a page is open: nothing to unsubscribe.
};
// The Worker injects the configured dashboard origin into every page it serves.
const getSnapshot = () =>
  document
    .querySelector<HTMLMetaElement>('meta[name="emitkit:app-url"]')
    ?.content.trim() || appOriginFor(window.location);
// Prerendered HTML always links to production; hydration then swaps in the
// current host's origin without a mismatch warning.
const getServerSnapshot = () => DEFAULT_APP_ORIGIN;

export const useAppLinks = () => {
  const origin = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  return {
    dashboard: `${origin}/`,
    signIn: `${origin}/auth/sign-in`,
    signUp: `${origin}/auth/sign-up`,
  };
};
