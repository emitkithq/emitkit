import { BrandIcon } from "@app/components/brand-icon";
import { EventMetadata } from "@app/features/events/event-values";
import { formatRelative } from "@app/lib/format";
import { Button, Chip } from "@heroui/react";
import { domainOfEmail } from "@shared/domains";
import { eventValue } from "@shared/event-value";
import type { ProductEvent } from "@shared/rpc/schemas";
import { Icon } from "@ui/icon";
import type { ComponentType, ReactNode } from "react";

const stampFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "long",
  second: "2-digit",
  weekday: "short",
});

const Row = ({ children, label }: { children: ReactNode; label: string }) => (
  <div className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3">
    <dt className="text-muted">{label}</dt>
    <dd className="min-w-0 wrap-anywhere">{children}</dd>
  </div>
);

/**
 * Wraps an event's channel label, so the dashboard can link it to the
 * channel's feed. Without one the label is plain text.
 */
export type ChannelLink = ComponentType<{
  children: ReactNode;
  event: ProductEvent;
}>;

/**
 * What someone can do about an event, drawn above its details: answering
 * an event that asks a question, for instance. Renders nothing for events
 * without actions.
 */
export type EventActions = ComponentType<{ event: ProductEvent }>;

/**
 * Everything about one event, shown under its row when unfolded: its
 * actions (only with `actions`), when and where it happened, who it
 * concerns, whether it was pushed, its metadata, and the delete action
 * (only with `onDelete`).
 */
export const EventDetails = ({
  actions: Actions,
  channelLink,
  event,
  now,
  onDelete,
  projectName,
}: {
  actions?: EventActions | undefined;
  channelLink?: ChannelLink | undefined;
  event: ProductEvent;
  now: number;
  onDelete?: ((event: ProductEvent) => void) | undefined;
  projectName: string | undefined;
}) => {
  const value = eventValue(event.metadata);
  const ChannelLabel = channelLink;
  const channelLabel = (
    <>
      {projectName ? (
        <span className="text-muted">{projectName} / </span>
      ) : null}
      #{event.channelName}
    </>
  );
  // The value is already on the row; list the rest.
  const metadata = value
    ? Object.fromEntries(
        Object.entries(event.metadata).filter(
          ([key]) => key !== "amount" && key !== "currency"
        )
      )
    : event.metadata;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {Actions ? <Actions event={event} /> : null}
      <dl className="text-body flex flex-col gap-2">
        <Row label="When">
          <time dateTime={event.createdAt}>
            {stampFormatter.format(new Date(event.createdAt))}
          </time>
          <span className="text-muted">
            {" "}
            · {formatRelative(event.createdAt, now)}
          </span>
        </Row>
        <Row label="Channel">
          {ChannelLabel ? (
            <ChannelLabel event={event}>{channelLabel}</ChannelLabel>
          ) : (
            channelLabel
          )}
        </Row>
        {event.userId ? (
          <Row label="User">
            <span className="flex min-w-0 items-center gap-2">
              <BrandIcon
                className="size-4 rounded"
                domain={domainOfEmail(event.userId)}
                fallback={null}
                size={16}
              />
              <span className="min-w-0">{event.userId}</span>
            </span>
          </Row>
        ) : null}
        <Row label="Push">
          {event.notify ? (
            <span className="flex items-center gap-1.5">
              <Icon
                className="text-accent-soft-foreground"
                name="bell"
                size={13}
              />
              Sent to subscribers
            </span>
          ) : (
            <span className="text-muted">Not sent</span>
          )}
        </Row>
        {event.tags.length > 0 ? (
          <Row label="Tags">
            <span className="flex flex-wrap gap-1">
              {event.tags.map((tag) => (
                <Chip key={tag} size="sm" variant="secondary">
                  {tag}
                </Chip>
              ))}
            </span>
          </Row>
        ) : null}
        <Row label="Source">{event.source}</Row>
      </dl>

      {Object.keys(metadata).length > 0 ? (
        <section aria-label="Metadata">
          <h4 className="text-meta text-muted mb-2.5 font-medium">Details</h4>
          <EventMetadata metadata={metadata} />
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <code className="text-caption text-muted truncate font-mono">
          {event.id}
        </code>
        {onDelete ? (
          <Button
            aria-label={`Delete “${event.title}”`}
            className="text-danger shrink-0"
            onPress={() => onDelete(event)}
            size="sm"
            variant="ghost"
          >
            <Icon name="trash" size={14} />
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
};
