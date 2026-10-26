import { usePwaState } from "@app/lib/pwa";
import { toast } from "@heroui/react";
import { useEffect, useRef } from "react";

/** Offers a reload, once, when a new version of the app has been deployed. */
export const UpdateNotifier = () => {
  const { isUpdateAvailable } = usePwaState();
  const hasNotified = useRef(false);

  useEffect(() => {
    if (!isUpdateAvailable || hasNotified.current) {
      return;
    }
    hasNotified.current = true;
    toast("A new version of EmitKit is available", {
      actionProps: {
        children: "Reload",
        onPress: () => window.location.reload(),
        size: "sm",
        variant: "primary",
      },
      description: "Reload to get the latest features and fixes.",
      timeout: 0,
    });
  }, [isUpdateAvailable]);

  return null;
};
