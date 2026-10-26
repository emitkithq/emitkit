import { errorMessage } from "@app/lib/errors";
import {
  currentPushSubscription,
  notificationPermission,
  pushSupport,
  rememberEndpoint,
  rememberedEndpoint,
  subscribeDevice,
  subscriptionPayload,
} from "@app/lib/push";
import { orpc, rpc } from "@app/lib/rpc";
import { getSession } from "@better-auth-ui/core";
import { toast } from "@heroui/react";
import type { PushPreferences } from "@shared/rpc/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

export const DEVICE_SUBSCRIPTION_KEY = ["push", "device-subscription"] as const;
const PUSH_HEALTH_KEY = ["push", "health"] as const;

/** Browser push failures are DOMExceptions with unhelpful messages. */
export const pushErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "This browser blocked push notifications. Private windows can't receive them, and site settings may block them.";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The browser's push service didn't respond. Check your connection and try again.";
  }
  return errorMessage(
    error,
    "Notifications couldn't be enabled on this device."
  );
};

export const deviceEndpoint = async () => {
  const subscription = await currentPushSubscription();
  return subscription?.endpoint ?? null;
};

export const fetchPublicKey = async () => {
  const { publicKey } = await rpc.notifications.publicKey();
  return publicKey;
};

/** This device's push subscription keys, or an error when it has none. */
const devicePayload = async () => {
  const subscription = await currentPushSubscription();
  if (!subscription) {
    throw new Error(
      "This device is no longer subscribed. Turn notifications on again."
    );
  }
  return subscriptionPayload(subscription);
};

/**
 * This device and push, across every organization you belong to: whether it
 * can receive them, turning them on (everywhere, all channels) or off, and
 * each organization's own switch and channels. The app is one PWA per
 * device, so these are device settings, not per-organization ones.
 */
export const useDevicePush = () => {
  const queryClient = useQueryClient();
  const viewerId = () => getSession(queryClient)?.user.id;
  const support = useMemo(() => pushSupport(), []);
  const [permission, setPermission] = useState(notificationPermission);
  const device = useQuery({
    enabled: support === "supported",
    queryFn: deviceEndpoint,
    queryKey: DEVICE_SUBSCRIPTION_KEY,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const endpoint = device.data ?? null;
  const preferencesOptions = orpc.notifications.preferences.queryOptions({
    input: { endpoint: endpoint ?? "" },
  });
  const preferences = useQuery({
    ...preferencesOptions,
    enabled: Boolean(endpoint),
  });
  const save = (next: PushPreferences) =>
    queryClient.setQueryData(preferencesOptions.queryKey, next);
  const refreshGuide = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.gettingStarted.status.key(),
    });

  const enable = useMutation({
    mutationFn: async (request: {
      readonly permission: Promise<NotificationPermission>;
      readonly fresh: boolean;
    }) => {
      const answer = await request.permission;
      setPermission(answer);
      if (answer !== "granted") {
        return null;
      }
      const subscription = await subscribeDevice(await fetchPublicKey(), {
        fresh: request.fresh,
      });
      const result = await rpc.notifications.enableEverywhere(
        subscriptionPayload(subscription)
      );
      return { endpoint: subscription.endpoint, result };
    },
    onError: (error) => toast.danger(pushErrorMessage(error)),
    onSuccess: async (outcome) => {
      if (!outcome) {
        toast.warning(
          "Notifications are blocked. Allow them for this site in your browser settings."
        );
        return;
      }
      queryClient.setQueryData(DEVICE_SUBSCRIPTION_KEY, outcome.endpoint);
      const userId = viewerId();
      if (userId) {
        rememberEndpoint(userId, outcome.endpoint);
      }
      await queryClient.invalidateQueries({ queryKey: PUSH_HEALTH_KEY });
      queryClient.setQueryData(
        orpc.notifications.preferences.queryKey({
          input: { endpoint: outcome.endpoint },
        }),
        outcome.result
      );
      await refreshGuide();
      toast.success("Notifications are on for this device");
    },
  });

  const disable = useMutation({
    mutationFn: async () => {
      if (endpoint) {
        await rpc.notifications.disableEverywhere({ endpoint });
      }
    },
    onError: (error) =>
      toast.danger(
        errorMessage(error, "Notifications couldn't be turned off.")
      ),
    onSuccess: async () => {
      const userId = viewerId();
      if (userId) {
        rememberEndpoint(userId, null);
      }
      await queryClient.invalidateQueries({
        queryKey: preferencesOptions.queryKey,
      });
      await refreshGuide();
      toast.success("Notifications are off for this device");
    },
  });

  const setOrganization = useMutation({
    mutationFn: async (change: {
      organizationId: string;
      enabled: boolean;
      channelIds: readonly string[];
    }) =>
      rpc.notifications.setOrganization({
        ...(await devicePayload()),
        channelIds: [...change.channelIds],
        enabled: change.enabled,
        organizationId: change.organizationId,
      }),
    onError: (error) =>
      toast.danger(errorMessage(error, "Your choice couldn't be saved.")),
    onSuccess: async (next) => {
      save(next);
      // Every organization switched off on purpose is not "push stopped".
      const userId = viewerId();
      if (userId) {
        rememberEndpoint(
          userId,
          next.organizations.some((organization) => organization.subscribed)
            ? endpoint
            : null
        );
      }
      await refreshGuide();
    },
  });

  const organizations = preferences.data?.organizations ?? [];
  return {
    disable: () => disable.mutate(),
    /**
     * Must run inside the press handler: browsers only prompt on a fresh
     * gesture. `fresh` replaces a subscription the push service stopped
     * delivering to.
     */
    enable: ({ fresh = false }: { readonly fresh?: boolean } = {}) =>
      enable.mutate({ fresh, permission: Notification.requestPermission() }),
    isBusy: enable.isPending || disable.isPending || setOrganization.isPending,
    isChecking:
      support === "supported" &&
      (device.isPending || (Boolean(endpoint) && preferences.isPending)),
    isDisabling: disable.isPending,
    isEnabling: enable.isPending,
    isSubscribed: Boolean(
      endpoint && organizations.some((organization) => organization.subscribed)
    ),
    loadError: preferences.error,
    organizations,
    permission,
    setOrganization: (change: {
      organizationId: string;
      enabled: boolean;
      channelIds: readonly string[];
    }) => setOrganization.mutate(change),
    support,
  };
};

export type DevicePushHealth = "ok" | "stopped" | "blocked";

/**
 * Whether push still works on this device for someone who turned it on, and
 * the server kept in step with the browser. A browser may replace its
 * subscription (the rows follow it) or drop it (it is renewed without a
 * prompt when permission stands). "stopped" is what can't be repaired
 * without the person: push was on here and no organization gets it now.
 */
const checkDevicePush = async (userId: string): Promise<DevicePushHealth> => {
  if (pushSupport() !== "supported") {
    return "ok";
  }
  const remembered = rememberedEndpoint(userId);
  const permission = notificationPermission();
  if (permission !== "granted") {
    return remembered && permission === "denied" ? "blocked" : "ok";
  }
  let subscription = await currentPushSubscription();
  if (!subscription && remembered) {
    try {
      subscription = await subscribeDevice(await fetchPublicKey());
    } catch {
      return "stopped";
    }
  }
  if (!subscription) {
    return "ok";
  }
  const moved =
    remembered && remembered !== subscription.endpoint ? remembered : null;
  const { organizations } = await rpc.notifications.syncDevice({
    ...subscriptionPayload(subscription),
    ...(moved ? { previousEndpoint: moved } : {}),
  });
  if (organizations > 0) {
    rememberEndpoint(userId, subscription.endpoint);
    return "ok";
  }
  return remembered ? "stopped" : "ok";
};

/** Checked when the app opens and whenever it comes back to the foreground. */
export const useDevicePushHealth = (userId: string) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryFn: async () => {
      const health = await checkDevicePush(userId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: DEVICE_SUBSCRIPTION_KEY }),
        queryClient.invalidateQueries({
          queryKey: orpc.notifications.preferences.key(),
        }),
      ]);
      return health;
    },
    queryKey: [...PUSH_HEALTH_KEY, userId],
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};
