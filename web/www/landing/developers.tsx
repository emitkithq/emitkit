import { Button, Tabs } from "@heroui/react";
import { Icon } from "@ui/icon";
import { Container } from "@www/components/container";
import { Halftone } from "@www/components/halftone";
import { SectionIntro } from "@www/components/section-intro";
import {
  API_REFERENCE_URL,
  EVENTS_ENDPOINT,
  MCP_ENDPOINT,
  SDK_DOCS_URL,
} from "@www/site";
import { useState } from "react";

/** Three ways in: an agent over MCP, then the hero's payment from code. */
const SNIPPETS = [
  {
    code: `{
  "mcpServers": {
    "emitkit": {
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer emitkit_…"
      }
    }
  }
}`,
    id: "mcp",
    label: "MCP",
    result: "Tools: createEvent · identifyUser · deleteIdentity",
  },
  {
    code: `curl ${EVENTS_ENDPOINT} \\
  -H "Authorization: Bearer $EMITKIT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channelName": "payments",
    "title": "Team plan purchased",
    "description": "5 seats · monthly",
    "icon": "💳",
    "userId": "leo@raycast.com",
    "metadata": { "amount": 75, "currency": "USD", "seats": 5 }
  }'`,
    id: "curl",
    label: "cURL",
    result: "201 Created · push sent to #payments",
  },
  {
    code: `import { EmitKit } from "@emitkit/js";

const emitkit = new EmitKit(process.env.EMITKIT_API_KEY!);

await emitkit.events.create({
  channelName: "payments",
  title: "Team plan purchased",
  description: "5 seats · monthly",
  icon: "💳",
  userId: "leo@raycast.com",
  metadata: { amount: 75, currency: "USD", seats: 5 },
});`,
    id: "typescript",
    label: "TypeScript",
    result: "201 Created · push sent to #payments",
  },
] as const;

const WAYS = [
  {
    body: "Claude, Cursor or any MCP client gets createEvent, identifyUser and deleteIdentity tools.",
    title: "MCP server",
  },
  {
    body: "POST /v1/events with an API key. Idempotency keys make retries safe.",
    title: "REST API",
  },
  {
    body: "@emitkit/js is typed end to end and has no runtime dependencies.",
    title: "TypeScript SDK",
  },
] as const;

/** Strings in Signal, as the kit's code cards set them; everything else plain. */
const STRING = /(?<string>"(?:[^"\\]|\\.)*")/u;
const Highlighted = ({ code }: Readonly<{ code: string }>) =>
  code.split(STRING).map((part, index) =>
    index % 2 === 1 ? (
      // oxlint-disable-next-line no-array-index-key -- a fixed split of a constant string.
      <span className="text-signal" key={index}>
        {part}
      </span>
    ) : (
      part
    )
  );

const CopyButton = ({ code }: Readonly<{ code: string }>) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className="text-muted"
      onPress={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      size="sm"
      variant="ghost"
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
};

export const Developers = () => (
  <section
    aria-labelledby="developers-title"
    className="dark bg-background text-foreground relative isolate overflow-hidden py-24 sm:py-32"
    id="developers"
  >
    <Halftone
      className="[mask-image:radial-gradient(120%_90%_at_85%_20%,black,transparent_70%)] opacity-40"
      pattern="ripple-white"
      position="100% 0%"
    />
    <Container className="relative grid items-start gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div className="reveal">
        <SectionIntro
          id="developers-title"
          label="For agents"
          number="02"
          title="Agents keep you in the loop too."
        >
          Connect an AI agent to the EmitKit MCP server and it tells you what
          you would want to know: a task finished, a refund waiting for your OK,
          a customer it could not help. Your code uses curl or the TypeScript
          SDK.
        </SectionIntro>
        <dl className="m-0 mt-10 grid gap-6">
          {WAYS.map((way) => (
            <div className="border-separator border-t pt-5" key={way.title}>
              <dt className="text-meta text-signal font-mono">{way.title}</dt>
              <dd className="text-body text-muted m-0 mt-1.5">{way.body}</dd>
            </div>
          ))}
        </dl>
        <div className="text-body mt-8 flex flex-wrap gap-x-6 gap-y-2">
          <a
            className="text-foreground inline-flex items-center gap-1.5 font-medium no-underline hover:underline"
            href={API_REFERENCE_URL}
          >
            API reference <Icon name="chevron-right" size={14} />
          </a>
          <a
            className="text-foreground inline-flex items-center gap-1.5 font-medium no-underline hover:underline"
            href={SDK_DOCS_URL}
          >
            SDK guide <Icon name="chevron-right" size={14} />
          </a>
        </div>
      </div>

      <div className="reveal border-border bg-midnight shadow-glow overflow-hidden rounded-2xl border">
        <Tabs defaultSelectedKey="mcp">
          <div className="border-separator flex items-center gap-3 border-b px-3 py-2.5">
            <Tabs.ListContainer>
              <Tabs.List aria-label="Ways to send an event">
                {SNIPPETS.map((snippet) => (
                  <Tabs.Tab id={snippet.id} key={snippet.id}>
                    {snippet.label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </div>
          {SNIPPETS.map((snippet) => (
            <Tabs.Panel className="p-0" id={snippet.id} key={snippet.id}>
              <pre className="text-foreground/85 m-0 min-h-[300px] overflow-x-auto px-5 py-5 font-mono text-[13px] leading-6">
                <code>
                  <Highlighted code={snippet.code} />
                </code>
              </pre>
              <div className="border-separator flex items-center gap-3 border-t py-2 pr-2 pl-5">
                <p className="text-meta text-muted m-0 flex items-center gap-2 font-mono">
                  <span aria-hidden="true" className="text-success">
                    →
                  </span>
                  {snippet.result}
                </p>
                <span className="ml-auto">
                  <CopyButton code={snippet.code} />
                </span>
              </div>
            </Tabs.Panel>
          ))}
        </Tabs>
      </div>
    </Container>
  </section>
);
