import { isIos, isStandalone } from "@app/lib/device";
import { rpc } from "@app/lib/rpc";

export const SERVICE_WORKER_URL = "/service-worker.js";

export type PushSupport = "ios-needs-install" | "supported" | "unsupported";

/**
 * Whether this browser can receive Web Push. iOS and iPadOS only offer it to
 * apps added to the Home Screen, which is worth saying instead of "unsupported".
 */
export const pushSupport = (): PushSupport => {
  if (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  ) {
    return "supported";
  }
  return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
};

export const notificationPermission = (): NotificationPermission =>
  "Notification" in window ? Notification.permission : "denied";

/** The page's service worker, registering it on demand (development included). */
export const ensureServiceWorker =
  async (): Promise<ServiceWorkerRegistration> => {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing?.active) {
      return existing;
    }
    if (!existing) {
      await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
        scope: "/",
      });
    }
    return navigator.serviceWorker.ready;
  };

export const currentPushSubscription =
  async (): Promise<PushSubscription | null> => {
    if (!("serviceWorker" in navigator)) {
      return null;
    }
    const registration = await navigator.serviceWorker.getRegistration("/");
    return registration ? registration.pushManager.getSubscription() : null;
  };

const BASE64URL_DASH = /-/gu;
const BASE64URL_UNDERSCORE = /_/gu;

/** The VAPID public key (base64url) as the bytes `pushManager.subscribe` wants. */
const vapidKeyBytes = (base64Url: string): Uint8Array<ArrayBuffer> => {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding)
    .replace(BASE64URL_DASH, "+")
    .replace(BASE64URL_UNDERSCORE, "/");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
};

const sameBytes = (left: ArrayBuffer | null, right: Uint8Array): boolean => {
  if (!left || left.byteLength !== right.byteLength) {
    return false;
  }
  const view = new Uint8Array(left);
  return view.every((byte, index) => byte === right[index]);
};

/**
 * This device's push subscription for `publicKey`. A subscription made with
 * another server key (the previous EmitKit app used the same origin) cannot
 * receive our pushes, so it is replaced; `fresh` replaces it regardless, for
 * one the push service has stopped delivering to.
 */
export const subscribeDevice = async (
  publicKey: string,
  { fresh = false }: { readonly fresh?: boolean } = {}
): Promise<PushSubscription> => {
  const registration = await ensureServiceWorker();
  const applicationServerKey = vapidKeyBytes(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (
      !fresh &&
      sameBytes(existing.options.applicationServerKey, applicationServerKey)
    ) {
      return existing;
    }
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({
    applicationServerKey,
    userVisibleOnly: true,
  });
};

export const subscriptionPayload = (subscription: PushSubscription) => {
  const { keys } = subscription.toJSON();
  return {
    auth: keys?.auth ?? "",
    endpoint: subscription.endpoint,
    p256dh: keys?.p256dh ?? "",
  };
};

const ENDPOINT_KEY_PREFIX = "emitkit:push-endpoint:";

/**
 * The endpoint this device last had push on with, per account: set when push
 * is turned on, cleared when it is turned off. Its presence is how the app
 * knows push *should* be working here, and it lets rows follow a
 * subscription the browser replaced.
 */
export const rememberedEndpoint = (userId: string): string | null => {
  try {
    return localStorage.getItem(`${ENDPOINT_KEY_PREFIX}${userId}`);
  } catch {
    return null;
  }
};

export const rememberEndpoint = (userId: string, endpoint: string | null) => {
  try {
    if (endpoint) {
      localStorage.setItem(`${ENDPOINT_KEY_PREFIX}${userId}`, endpoint);
    } else {
      localStorage.removeItem(`${ENDPOINT_KEY_PREFIX}${userId}`);
    }
  } catch {
    // Storage unavailable: the app can't warn when push stops here.
  }
};

/** Forgets every account's marker on this device (sign-out, account deleted). */
export const forgetRememberedEndpoints = () => {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(ENDPOINT_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage unavailable: nothing was remembered.
  }
};

const RELEASE_TIMEOUT_MS = 3000;

/**
 * Before signing out: this device stops receiving the account's pushes, so
 * the next person on it never sees them. The browser keeps its subscription
 * for whoever turns push on next. Best effort and time-limited: sign-out
 * never waits on it for long or fails because of it.
 */
export const releaseDevicePush = async (): Promise<void> => {
  try {
    const subscription = await currentPushSubscription();
    if (subscription) {
      await rpc.notifications.disableEverywhere(
        { endpoint: subscription.endpoint },
        { signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS) }
      );
    }
  } catch {
    // Offline or already signed out: the rows stay until the push service
    // reports the subscription gone, as before.
  }
};
