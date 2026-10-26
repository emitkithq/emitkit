import { QrCode } from "@app/features/onboarding/qr-code";
import { isIos, isStandalone } from "@app/lib/device";
import { useDevicePush } from "@app/lib/device-push";
import { errorMessage } from "@app/lib/errors";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, Modal, Spinner, Tabs, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@ui/icon";
import type { ReactNode } from "react";
import { useMemo } from "react";

const MOBILE = /Android|iPhone|iPad|iPod|Mobile/u;

/** A phone or tablet, where a QR code pointing here would be pointless. */
const onMobile = () => MOBILE.test(navigator.userAgent) || isIos();

const Steps = ({ children }: { children: ReactNode }) => (
  <ol className="text-body text-muted m-0 grid list-decimal gap-2 pl-5 marker:text-[color:var(--muted)]">
    {children}
  </ol>
);

const Strong = ({ children }: { children: ReactNode }) => (
  <span className="text-foreground font-medium">{children}</span>
);

const InstallSteps = () => (
  <Tabs
    className="w-full min-w-0"
    defaultSelectedKey={isIos() ? "ios" : "android"}
  >
    <Tabs.ListContainer className="w-fit">
      <Tabs.List aria-label="Your phone">
        <Tabs.Tab id="ios">
          iPhone
          <Tabs.Indicator />
        </Tabs.Tab>
        <Tabs.Tab id="android">
          Android
          <Tabs.Indicator />
        </Tabs.Tab>
      </Tabs.List>
    </Tabs.ListContainer>
    <Tabs.Panel className="pt-3" id="ios">
      <Steps>
        <li>
          Open EmitKit in <Strong>Safari</Strong> and sign in.
        </li>
        <li>
          Tap <Icon className="inline align-[-2px]" name="share" size={14} />{" "}
          <Strong>Share</Strong>, then <Strong>Add to Home Screen</Strong>.
        </li>
        <li>
          Open EmitKit from your Home Screen. iPhone only allows notifications
          for apps added there.
        </li>
        <li>
          Tap <Strong>Enable notifications</Strong> (in this guide, or Settings
          → Notifications) and allow them.
        </li>
      </Steps>
    </Tabs.Panel>
    <Tabs.Panel className="pt-3" id="android">
      <Steps>
        <li>
          Open EmitKit in <Strong>Chrome</Strong> and sign in.
        </li>
        <li>
          Tap <Strong>⋮</Strong>, then <Strong>Install app</Strong> (or{" "}
          <Strong>Add to Home screen</Strong>).
        </li>
        <li>
          Open EmitKit, tap <Strong>Enable notifications</Strong> and allow
          them.
        </li>
      </Steps>
    </Tabs.Panel>
  </Tabs>
);

/** Push on this device, and a real event to prove it. */
const ThisDevice = () => {
  const push = useDevicePush();
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: () => rpc.gettingStarted.sendTestEvent(),
    onError: (error) =>
      toast.danger(errorMessage(error, "The test event couldn't be sent.")),
    onSuccess: async () => {
      toast.success("Test event sent. The notification is on its way.");
      await queryClient.invalidateQueries({
        queryKey: orpc.gettingStarted.status.key(),
      });
      // The push travels through the queue; billing notices the first one.
      for (const delay of [6000, 15_000]) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
        }, delay);
      }
    },
  });

  if (push.support === "ios-needs-install") {
    return (
      <p className="text-body text-muted" data-device-push="needs-install">
        Add EmitKit to your Home Screen first (steps above), then open it from
        there to turn on notifications.
      </p>
    );
  }
  if (push.support === "unsupported") {
    return (
      <p className="text-body text-muted" data-device-push="unsupported">
        This browser can’t receive push notifications. Use Chrome, Edge, Firefox
        or Safari, or your phone.
      </p>
    );
  }
  if (push.isChecking) {
    return <Spinner aria-label="Checking this device" size="sm" />;
  }
  if (push.permission === "denied") {
    return (
      <p className="text-body text-danger" data-device-push="blocked">
        Notifications are blocked for this site. Allow them in the browser’s
        site settings, then reload.
      </p>
    );
  }
  if (!push.isSubscribed) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-device-push="off">
        <Button
          isPending={push.isEnabling}
          onPress={() => push.enable()}
          size="sm"
        >
          <Icon name="bell" size={14} />
          Enable notifications
        </Button>
        <span className="text-meta text-muted">On this device</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-device-push="on">
      <span className="text-body text-foreground flex items-center gap-1.5">
        <Icon className="text-success" name="check" size={15} />
        Notifications are on here
      </span>
      <Button
        isPending={send.isPending}
        onPress={() => send.mutate()}
        size="sm"
        variant="secondary"
      >
        <Icon name="send" size={14} />
        Send a test event
      </Button>
    </div>
  );
};

/**
 * Getting EmitKit onto a phone: a QR code that opens the app there, the
 * install steps for iPhone and Android, and push on the current device.
 * Opens from the setup guide and from the account menu.
 */
export const PhoneSetup = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const mobile = useMemo(() => onMobile(), []);
  const installed = useMemo(() => isStandalone(), []);
  const appUrl = `${window.location.origin}/`;

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Container placement="center">
        <Modal.Dialog
          aria-label="Get EmitKit on your phone"
          className="max-h-[calc(var(--visual-viewport-height)-2rem)] w-[min(640px,calc(100vw-2rem))] max-w-none overflow-y-auto sm:rounded-[28px]"
        >
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="text-title text-foreground font-semibold">
              Get it on your phone 📱
            </Modal.Heading>
            <p className="text-body text-muted mt-1">
              Every event you send with “notify”: true shows up as a push
              notification.
            </p>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-6">
            {mobile ? null : (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <QrCode label={`Open ${appUrl}`} value={appUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-label text-foreground font-semibold">
                    Scan with your phone’s camera
                  </p>
                  <p className="text-body text-muted mt-1">
                    It opens EmitKit at{" "}
                    <span className="text-foreground font-mono">
                      {window.location.host}
                    </span>
                    . Sign in with the same account, then follow the steps
                    below.
                  </p>
                </div>
              </div>
            )}
            {installed ? null : <InstallSteps />}
            <div className="border-separator border-t pt-5">
              <p className="text-label text-foreground mb-2 font-semibold">
                {mobile ? "Notifications on this phone" : "Or right here"}
              </p>
              <ThisDevice />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={onClose} size="sm" variant="ghost">
              Done
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
