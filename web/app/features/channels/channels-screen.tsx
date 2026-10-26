import { ConfirmDialog } from "@app/components/confirm-dialog";
import { ListSkeleton } from "@app/components/list-skeleton";
import { PageHeader } from "@app/components/page-header";
import { ProjectAvatar } from "@app/components/project-avatar";
import { RowActions } from "@app/components/row-actions";
import { SelectField } from "@app/components/select-field";
import { ChannelDialog } from "@app/features/channels/channel-dialog";
import { errorMessage } from "@app/lib/errors";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, toast } from "@heroui/react";
import type { Channel, Project } from "@shared/rpc/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@ui/empty-state";
import { Icon } from "@ui/icon";
import { ListView } from "@ui/list-view";
import { useMemo, useState } from "react";

type Pending =
  | { kind: "create" }
  | { channel: Channel; kind: "delete" }
  | { channel: Channel; kind: "edit" };

const ALL = "";

const ChannelList = ({
  channels,
  onAction,
  project,
}: {
  channels: readonly Channel[];
  onAction: (action: string, channel: Channel) => void;
  project: Project;
}) => (
  <section aria-labelledby={`channels-${project.id}`}>
    <h2
      className="text-body text-foreground mb-2 flex items-center gap-2 px-1 font-medium"
      id={`channels-${project.id}`}
    >
      <ProjectAvatar project={project} size="sm" />
      <span className="truncate">{project.name}</span>
      <span className="text-muted font-normal tabular-nums">
        {channels.length}
      </span>
    </h2>
    <ListView aria-label={`Channels in ${project.name}`}>
      {channels.map((channel) => (
        <ListView.Item
          action={
            <RowActions
              actions={[
                { icon: "activity", id: "events", label: "View events" },
                { icon: "edit", id: "edit", label: "Edit" },
              ]}
              danger={{ icon: "trash", id: "delete", label: "Delete" }}
              label={`#${channel.name}`}
              onAction={(action) => onAction(action, channel)}
            />
          }
          key={channel.id}
          onPress={() => onAction("events", channel)}
        >
          <span
            aria-hidden="true"
            className="bg-default grid size-9 shrink-0 place-items-center rounded-xl text-lg"
          >
            {channel.icon ?? (
              <Icon className="text-muted" name="hash" size={15} />
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <ListView.Title>
              <span className="text-muted font-normal">#</span>
              {channel.name}
            </ListView.Title>
            <ListView.Description>
              {channel.description ?? "No description"}
            </ListView.Description>
          </span>
        </ListView.Item>
      ))}
    </ListView>
  </section>
);

/**
 * Every channel of the organization, grouped by project: create one, change
 * its icon and description, delete it, or open its events.
 */
export const ChannelsScreen = ({
  onProjectChange,
  org,
  projectId,
}: {
  onProjectChange: (projectId: string | undefined) => void;
  org: string;
  projectId: string | undefined;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending>();
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
  const channels = useQuery(orpc.channels.list.queryOptions({ input: {} }));

  const liveProjects = useMemo(
    () =>
      (projects.data ?? [])
        .filter((project) => !project.deletedAt)
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    [projects.data]
  );
  const shownProjects = liveProjects.filter(
    (project) => !projectId || project.id === projectId
  );
  const channelsOf = (project: Project) =>
    (channels.data ?? []).filter((channel) => channel.projectId === project.id);
  const shownCount = shownProjects.reduce(
    (count, project) => count + channelsOf(project).length,
    0
  );

  const remove = useMutation({
    mutationFn: (channel: Channel) => rpc.channels.remove({ id: channel.id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The channel couldn't be deleted.")),
    onSuccess: async (_result, channel) => {
      setPending(undefined);
      toast.success(`Deleted #${channel.name}`);
      await queryClient.invalidateQueries({ queryKey: orpc.channels.key() });
    },
  });

  const onAction = (action: string, channel: Channel) => {
    if (action === "events") {
      navigate({
        params: { org },
        search: { channelId: channel.id, projectId: channel.projectId },
        to: "/$org",
      });
    } else if (action === "edit") {
      setPending({ channel, kind: "edit" });
    } else if (action === "delete") {
      setPending({ channel, kind: "delete" });
    }
  };

  const retry = async () => {
    await Promise.all([projects.refetch(), channels.refetch()]);
  };

  const renderBody = () => {
    if (projects.isPending || channels.isPending) {
      return <ListSkeleton />;
    }
    if (projects.isError || channels.isError) {
      return (
        <EmptyState
          action={
            <Button onPress={retry} size="sm" variant="secondary">
              Try again
            </Button>
          }
          description={errorMessage(
            projects.error ?? channels.error,
            "Channels couldn't be loaded."
          )}
          icon="close"
          title="Channels unavailable"
          variant="dashed"
        />
      );
    }
    if (liveProjects.length === 0) {
      return (
        <EmptyState
          action={
            <Button
              onPress={() =>
                navigate({ params: { org }, to: "/$org/projects" })
              }
              size="sm"
            >
              Go to projects
            </Button>
          }
          description="Channels live in a project. Create a project first."
          icon="folder"
          title="No projects yet"
          variant="dashed"
        />
      );
    }
    if (shownCount === 0) {
      return (
        <EmptyState
          action={
            <Button onPress={() => setPending({ kind: "create" })} size="sm">
              Create channel
            </Button>
          }
          description={
            <>
              Create one here, or send an event with a new{" "}
              <code className="text-meta font-mono">channelName</code>.
            </>
          }
          icon="hash"
          title="No channels yet"
          variant="dashed"
        />
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {shownProjects.map((project) => {
          const own = channelsOf(project);
          return own.length > 0 ? (
            <ChannelList
              channels={own}
              key={project.id}
              onAction={onAction}
              project={project}
            />
          ) : null;
        })}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        actions={
          <Button
            isDisabled={liveProjects.length === 0}
            onPress={() => setPending({ kind: "create" })}
            size="sm"
          >
            <Icon name="plus" size={14} />
            Create channel
          </Button>
        }
        title="Channels"
      />
      <div className="max-w-page mx-auto w-full px-4 pt-2 pb-24">
        <div className="flex flex-col gap-5">
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
            <p className="text-body text-muted">
              Where events land. Each has a name your code sends.
            </p>
            {liveProjects.length > 1 ? (
              <SelectField
                className="w-full sm:w-56"
                compact
                hideLabel
                label="Project"
                onValueChange={(value) =>
                  onProjectChange(value === ALL ? undefined : value)
                }
                options={[
                  { label: "All projects", value: ALL },
                  ...liveProjects.map((project) => ({
                    label: project.name,
                    value: project.id,
                  })),
                ]}
                value={projectId ?? ALL}
              />
            ) : null}
          </div>
          {renderBody()}
        </div>
      </div>

      {pending?.kind === "create" || pending?.kind === "edit" ? (
        <ChannelDialog
          channel={pending.kind === "edit" ? pending.channel : undefined}
          defaultProjectId={projectId}
          isOpen
          onOpenChange={(open) => {
            if (!open) {
              setPending(undefined);
            }
          }}
          projects={liveProjects}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Delete channel"
        description={
          <>
            <span className="text-foreground font-medium">
              #{pending?.kind === "delete" ? pending.channel.name : ""}
            </span>{" "}
            and its events leave the feed. An event sent to this name later
            brings the channel back.
          </>
        }
        isOpen={pending?.kind === "delete"}
        isPending={remove.isPending}
        onConfirm={() =>
          pending?.kind === "delete" && remove.mutate(pending.channel)
        }
        onOpenChange={(open) => {
          if (!open) {
            setPending(undefined);
          }
        }}
        title="Delete this channel?"
      />
    </>
  );
};
