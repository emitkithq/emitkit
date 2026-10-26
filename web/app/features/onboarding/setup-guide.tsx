import { CodeBlock } from "@app/components/code-block";
import { fireConfetti } from "@app/features/onboarding/confetti";
import { eventCurl, eventSdkSnippet, sdkDocsUrl } from "@app/lib/api-url";
import { errorMessage } from "@app/lib/errors";
import { plural } from "@app/lib/format";
import { orpc, rpc } from "@app/lib/rpc";
import { useCopy } from "@app/lib/use-copy";
import { Button, Modal, Tabs, toast } from "@heroui/react";
import type { ApiKey, GettingStarted } from "@shared/rpc/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Icon } from "@ui/icon";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/** While waiting for the first event, look for it this often. */
const POLL_MS = 2500;

const Step = ({
  children,
  done,
  number,
  title,
}: {
  children: ReactNode;
  done: boolean;
  number: number;
  title: string;
}) => (
  <li className="flex gap-3.5" data-done={done || undefined} data-step={number}>
    <span
      className={`text-meta mt-0.5 grid size-6 shrink-0 place-items-center rounded-full font-semibold ${
        done ? "bg-success text-white" : "bg-default-soft text-foreground"
      }`}
    >
      {done ? <Icon name="check" size={13} /> : number}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-label text-foreground font-semibold">{title}</p>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </div>
  </li>
);

/** The starter key, masked until revealed; revealed keys fill in the snippets. */
const KeyStep = ({
  apiKey,
  onRevealed,
  secret,
}: {
  apiKey: ApiKey | null;
  onRevealed: (secret: string) => void;
  secret: string | null;
}) => {
  const { copied, copy } = useCopy();
  const reveal = useMutation({
    mutationFn: (id: string) => rpc.apiKeys.reveal({ id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The key couldn't be revealed.")),
    onSuccess: (result) => onRevealed(result.secret),
  });
  if (!apiKey) {
    return (
      <p className="text-body text-muted">
        Create a key in{" "}
        <Link
          className="text-foreground underline underline-offset-2"
          search={(prev) => ({
            ...prev,
            guide: undefined,
            settings: "api-keys",
          })}
          to="."
        >
          Settings → API keys
        </Link>
        . Only owners and admins can.
      </p>
    );
  }
  return (
    <div className="flex items-stretch gap-2">
      <code
        aria-label="API key"
        className="border-border bg-background text-foreground text-body block min-w-0 flex-1 overflow-x-auto rounded-lg border px-3 py-2 font-mono whitespace-nowrap"
        data-api-key
      >
        {secret ?? `${apiKey.start ?? "emitkit_"}••••••••`}
      </code>
      {secret ? (
        <Button
          aria-label="Copy API key"
          onPress={() => copy("key", secret)}
          size="sm"
          variant="secondary"
        >
          <Icon name={copied === "key" ? "check" : "copy"} size={14} />
          {copied === "key" ? "Copied" : "Copy"}
        </Button>
      ) : (
        <Button
          isPending={reveal.isPending}
          onPress={() => reveal.mutate(apiKey.id)}
          size="sm"
          variant="secondary"
        >
          <Icon name="eye" size={14} />
          Reveal
        </Button>
      )}
    </div>
  );
};

const EventStep = ({
  firstEventAt,
  org,
  secret,
}: {
  firstEventAt: string | null;
  org: string;
  secret: string | null;
}) => {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: () => rpc.gettingStarted.sendTestEvent(),
    onError: (error) =>
      toast.danger(errorMessage(error, "The test event couldn't be sent.")),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.gettingStarted.status.key(),
      }),
  });
  if (firstEventAt) {
    return (
      <p className="text-body text-muted" data-event-arrived>
        🎉 It arrived.{" "}
        <Link
          className="text-foreground underline underline-offset-2"
          params={{ org }}
          search={{}}
          to="/$org"
        >
          See it in your feed
        </Link>
        , and send events from your app the same way.
      </p>
    );
  }
  return (
    <>
      <Tabs className="w-full min-w-0" defaultSelectedKey="curl">
        <Tabs.ListContainer className="w-fit">
          <Tabs.List aria-label="Send an event with">
            <Tabs.Tab id="curl">
              curl
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="typescript">
              TypeScript
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel className="pt-3" id="curl">
          <CodeBlock code={eventCurl({ apiKey: secret ?? undefined })} />
        </Tabs.Panel>
        <Tabs.Panel className="pt-3" id="typescript">
          <CodeBlock
            code={eventSdkSnippet()}
            copyLabel="Copy code"
            label="npm i @emitkit/js"
          />
          <a
            className="text-meta text-muted mt-2 inline-block underline underline-offset-2"
            href={sdkDocsUrl()}
            rel="noreferrer"
            target="_blank"
          >
            SDK guide
          </a>
        </Tabs.Panel>
      </Tabs>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          isPending={send.isPending}
          onPress={() => send.mutate()}
          size="sm"
        >
          <Icon name="send" size={14} />
          Send a test event
        </Button>
        <span className="text-meta text-muted flex items-center gap-1.5">
          <span className="bg-accent size-1.5 animate-pulse rounded-full" />
          Waiting for your first event…
        </span>
      </div>
    </>
  );
};

/**
 * The setup guide: the starter key, a first event (from code or a button,
 * with confetti when it lands) and the phone. Opens by itself in a new
 * workspace, and from the account menu any time after.
 */
export const SetupGuide = ({
  isOpen,
  onClose,
  onPhone,
  org,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPhone: () => void;
  org: string;
}) => {
  const [secret, setSecret] = useState<string | null>(null);
  // What the first status said, so confetti only greets an event that
  // arrives while the guide is open.
  const seen = useRef<{ firstEventAt: string | null } | null>(null);
  const status = useQuery({
    ...orpc.gettingStarted.status.queryOptions(),
    enabled: isOpen,
    refetchInterval: (query) => {
      const data: GettingStarted | undefined = query.state.data;
      return isOpen && !data?.firstEventAt ? POLL_MS : false;
    },
  });
  const { data } = status;

  const firstEventAt = data?.firstEventAt ?? null;
  useEffect(() => {
    if (!data) {
      return;
    }
    if (seen.current && seen.current.firstEventAt === null && firstEventAt) {
      fireConfetti();
    }
    seen.current = { firstEventAt };
  }, [data, firstEventAt]);

  const devices = data?.devices ?? 0;
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
          aria-label="Setup guide"
          className="max-h-[calc(var(--visual-viewport-height)-2rem)] w-[min(640px,calc(100vw-2rem))] max-w-none overflow-y-auto sm:rounded-[28px]"
        >
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="text-title text-foreground font-semibold">
              Welcome to EmitKit 👋
            </Modal.Heading>
            <p className="text-body text-muted mt-1">
              Three steps from your code to your phone.
            </p>
          </Modal.Header>
          <Modal.Body>
            <ol className="m-0 flex list-none flex-col gap-6 p-0 pt-2">
              <Step done={secret !== null} number={1} title="Your API key">
                <KeyStep
                  apiKey={data?.apiKey ?? null}
                  onRevealed={setSecret}
                  secret={secret}
                />
              </Step>
              <Step
                done={firstEventAt !== null}
                number={2}
                title="Send your first event"
              >
                <EventStep
                  firstEventAt={firstEventAt}
                  org={org}
                  secret={secret}
                />
              </Step>
              <Step done={devices > 0} number={3} title="Get it on your phone">
                <p className="text-body text-muted">
                  {devices > 0
                    ? `Push is on for ${plural(devices, "device")}. Add another any time.`
                    : "Install EmitKit on your phone and turn on notifications. Every event you send with “notify”: true lands there."}
                </p>
                <div>
                  <Button
                    onPress={onPhone}
                    size="sm"
                    variant={firstEventAt ? "primary" : "secondary"}
                  >
                    <Icon name="smartphone" size={14} />
                    Set up your phone
                  </Button>
                </div>
              </Step>
            </ol>
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={onClose} size="sm" variant="ghost">
              {firstEventAt && devices > 0 ? "Done" : "I'll finish later"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
