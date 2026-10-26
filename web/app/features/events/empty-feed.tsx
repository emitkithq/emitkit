import { eventCurl, eventSdkSnippet, sdkDocsUrl } from "@app/lib/api-url";
import { useCopy } from "@app/lib/use-copy";
import { Button, Tabs } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@ui/empty-state";
import { Icon } from "@ui/icon";

const Snippet = ({ code }: { code: string }) => {
  const { copied, copy } = useCopy();
  return (
    <div className="border-border bg-surface relative w-full min-w-0 rounded-2xl border">
      <pre className="text-foreground/85 text-meta overflow-x-auto p-4 pr-12 font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        aria-label={copied === "code" ? "Copied" : "Copy code"}
        className="absolute top-2 right-2"
        isIconOnly
        onPress={() => copy("code", code)}
        size="sm"
        variant="ghost"
      >
        <Icon name={copied === "code" ? "check" : "copy"} size={14} />
      </Button>
    </div>
  );
};

/**
 * What someone with nothing to read needs: the few lines that put an event
 * on this screen, with the SDK first and curl one tab away.
 */
export const EmptyFeed = ({
  channelName,
}: {
  channelName: string | undefined;
}) => (
  <div className="flex min-w-0 flex-col items-center gap-4 py-10">
    <EmptyState
      description={
        channelName
          ? `Send one to #${channelName} and it appears here live.`
          : "Send one from your code and it appears here live."
      }
      icon="activity"
      title={channelName ? `Nothing in #${channelName} yet` : "No events yet"}
      variant="block"
    />
    <Tabs className="w-full min-w-0 text-left" defaultSelectedKey="typescript">
      <Tabs.ListContainer className="mx-auto w-fit">
        <Tabs.List aria-label="Send an event with">
          <Tabs.Tab id="typescript">
            TypeScript
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="curl">
            cURL
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel className="min-w-0 pt-3" id="typescript">
        <Snippet code={eventSdkSnippet({ channelName })} />
      </Tabs.Panel>
      <Tabs.Panel className="min-w-0 pt-3" id="curl">
        <Snippet code={eventCurl({ channelName: channelName ?? "payments" })} />
      </Tabs.Panel>
    </Tabs>
    <p className="text-meta text-muted">
      <Link
        className="text-accent-soft-foreground no-underline hover:underline"
        search={(prev) => ({ ...prev, settings: "api-keys" })}
        to="."
      >
        Get an API key
      </Link>
      {" · "}
      <a
        className="text-accent-soft-foreground no-underline hover:underline"
        href={sdkDocsUrl()}
        rel="noreferrer"
        target="_blank"
      >
        SDK docs
      </a>
    </p>
  </div>
);
