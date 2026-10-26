import { SERVICE_WORKER_URL } from "@app/lib/push";
import { useSyncExternalStore } from "react";

/** The `beforeinstallprompt` event (Chromium only, not in the DOM typings). */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  installPrompt: InstallPromptEvent | null;
  isUpdateAvailable: boolean;
}

const UPDATE_CHECK_MS = 15 * 60 * 1000;

let state: PwaState = { installPrompt: null, isUpdateAvailable: false };
const listeners = new Set<() => void>();

const setState = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePwaState = (): PwaState =>
  useSyncExternalStore(subscribe, () => state);

export const clearInstallPrompt = () => setState({ installPrompt: null });

/** The hashed entry script a document loads, e.g. `/assets/app-3f9a.js`. */
const entryScript = (document: Document): string | null =>
  document
    .querySelector<HTMLScriptElement>('script[type="module"][src^="/assets/"]')
    ?.getAttribute("src") ?? null;

/**
 * Whether a newer build has been deployed. The service worker is a static
 * file whose bytes don't change between deploys, so its update cycle can't
 * tell; the app shell's hashed entry script can.
 */
const checkForNewBuild = async (loadedEntry: string) => {
  try {
    const response = await fetch("/", {
      cache: "no-store",
      headers: { accept: "text/html" },
    });
    if (!response.ok) {
      return;
    }
    const latest = entryScript(
      new DOMParser().parseFromString(await response.text(), "text/html")
    );
    if (latest && latest !== loadedEntry) {
      setState({ isUpdateAvailable: true });
    }
  } catch {
    // Offline or mid-deploy; the next check will tell.
  }
};

const checkServiceWorker = async (registration: ServiceWorkerRegistration) => {
  try {
    await registration.update();
  } catch {
    // Offline: try again at the next interval.
  }
};

const registerServiceWorker = async () => {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // The very first install also claims the page; only a replacement is news.
    if (hadController) {
      setState({ isUpdateAvailable: true });
    }
  });
  try {
    const registration = await navigator.serviceWorker.register(
      SERVICE_WORKER_URL,
      { scope: "/" }
    );
    setInterval(() => checkServiceWorker(registration), UPDATE_CHECK_MS);
  } catch {
    // Private mode or blocked: the app works without it, just not offline.
  }
};

/**
 * Wires up the installable-app pieces: install prompt capture everywhere, and
 * in production the service worker plus new-build detection.
 */
export const startPwa = () => {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    setState({ installPrompt: event as InstallPromptEvent });
  });
  window.addEventListener("appinstalled", clearInstallPrompt);

  if (!import.meta.env.PROD) {
    return;
  }
  if ("serviceWorker" in navigator) {
    registerServiceWorker();
  }
  const loadedEntry = entryScript(document);
  if (loadedEntry) {
    setInterval(() => checkForNewBuild(loadedEntry), UPDATE_CHECK_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        checkForNewBuild(loadedEntry);
      }
    });
  }
};
