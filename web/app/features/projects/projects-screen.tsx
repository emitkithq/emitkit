import { ConfirmDialog } from "@app/components/confirm-dialog";
import { ListSkeleton } from "@app/components/list-skeleton";
import { PageHeader } from "@app/components/page-header";
import { ProjectAvatar } from "@app/components/project-avatar";
import { RowActions } from "@app/components/row-actions";
import { ProjectDialog } from "@app/features/projects/project-dialog";
import { errorMessage } from "@app/lib/errors";
import { calendarDate } from "@app/lib/format";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, toast } from "@heroui/react";
import type { Project } from "@shared/rpc/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@ui/badge";
import { EmptyState } from "@ui/empty-state";
import { Icon } from "@ui/icon";
import { ListView } from "@ui/list-view";
import { Segment } from "@ui/segment";
import { useMemo, useState } from "react";

type Pending =
  | { kind: "create" }
  | { kind: "delete"; project: Project }
  | { kind: "edit"; project: Project };

type View = "active" | "deleted";

const hostOf = (url: string | null) => {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The organization's projects: one row each, its actions in the row's menu.
 * Deleted projects wait in their own list until they are purged.
 */
export const ProjectsScreen = ({ org }: { org: string }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("active");
  const [pending, setPending] = useState<Pending>();

  const projects = useQuery(
    orpc.projects.list.queryOptions({ input: { includeDeleted: true } })
  );
  const channels = useQuery(orpc.channels.list.queryOptions({ input: {} }));

  const { active, deleted } = useMemo(() => {
    const sorted = (projects.data ?? []).toSorted((left, right) =>
      left.name.localeCompare(right.name)
    );
    return {
      active: sorted.filter((project) => project.deletedAt === null),
      deleted: sorted.filter((project) => project.deletedAt !== null),
    };
  }, [projects.data]);
  const channelCount = (project: Project) =>
    (channels.data ?? []).filter((channel) => channel.projectId === project.id)
      .length;
  const shownView: View = deleted.length === 0 ? "active" : view;

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.channels.key() }),
    ]);

  const remove = useMutation({
    mutationFn: (project: Project) => rpc.projects.remove({ id: project.id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The project couldn't be deleted.")),
    onSuccess: async (_result, project) => {
      setPending(undefined);
      toast.success(`Deleted ${project.name}`, {
        description: "You can restore it from Deleted.",
      });
      await invalidate();
    },
  });
  const restore = useMutation({
    mutationFn: (project: Project) => rpc.projects.restore({ id: project.id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The project couldn't be restored.")),
    onSuccess: async (project) => {
      toast.success(`Restored ${project.name}`);
      await invalidate();
    },
  });

  const onAction = (action: string, project: Project) => {
    if (action === "events") {
      navigate({
        params: { org },
        search: { projectId: project.id },
        to: "/$org",
      });
    } else if (action === "channels") {
      navigate({
        params: { org },
        search: { projectId: project.id },
        to: "/$org/channels",
      });
    } else if (action === "edit") {
      setPending({ kind: "edit", project });
    } else if (action === "delete") {
      setPending({ kind: "delete", project });
    }
  };

  const renderActive = () => {
    if (active.length === 0) {
      return (
        <EmptyState
          action={
            <Button onPress={() => setPending({ kind: "create" })} size="sm">
              Create project
            </Button>
          }
          description="A project is one product you send events from. Its channels and API keys belong to it."
          icon="folder"
          title="No projects yet"
          variant="dashed"
        />
      );
    }
    return (
      <ListView aria-label="Projects">
        {active.map((project) => (
          <ListView.Item
            action={
              <RowActions
                actions={[
                  { icon: "activity", id: "events", label: "View events" },
                  { icon: "hash", id: "channels", label: "Channels" },
                  { icon: "edit", id: "edit", label: "Edit" },
                ]}
                danger={{ icon: "trash", id: "delete", label: "Delete" }}
                label={project.name}
                onAction={(action) => onAction(action, project)}
              />
            }
            key={project.id}
            onPress={() => onAction("events", project)}
          >
            <ProjectAvatar project={project} />
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <ListView.Title>{project.name}</ListView.Title>
                {project.firstEventAt ? null : (
                  <Badge className="shrink-0">No events yet</Badge>
                )}
              </span>
              <ListView.Description>
                {[
                  hostOf(project.url),
                  plural(channelCount(project), "channel", "channels"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </ListView.Description>
            </span>
          </ListView.Item>
        ))}
      </ListView>
    );
  };

  const renderDeleted = () => (
    <ListView aria-label="Deleted projects">
      {deleted.map((project) => (
        <ListView.Item
          action={
            <Button
              aria-label={`Restore ${project.name}`}
              isPending={
                restore.isPending && restore.variables?.id === project.id
              }
              onPress={() => restore.mutate(project)}
              size="sm"
              variant="secondary"
            >
              Restore
            </Button>
          }
          key={project.id}
        >
          <span className="flex min-w-0 items-center gap-3 opacity-70">
            <ProjectAvatar project={project} />
            <span className="flex min-w-0 flex-col">
              <ListView.Title>{project.name}</ListView.Title>
              <ListView.Description>
                Deleted {calendarDate(project.deletedAt ?? project.createdAt)}
              </ListView.Description>
            </span>
          </span>
        </ListView.Item>
      ))}
    </ListView>
  );

  const renderBody = () => {
    if (projects.isPending || channels.isPending) {
      return <ListSkeleton />;
    }
    if (projects.isError || channels.isError) {
      return (
        <EmptyState
          action={
            <Button onPress={() => invalidate()} size="sm" variant="secondary">
              Try again
            </Button>
          }
          description={errorMessage(
            projects.error ?? channels.error,
            "Projects couldn't be loaded."
          )}
          icon="close"
          title="Projects unavailable"
          variant="dashed"
        />
      );
    }
    return shownView === "deleted" ? renderDeleted() : renderActive();
  };

  return (
    <>
      <PageHeader
        actions={
          <Button onPress={() => setPending({ kind: "create" })} size="sm">
            <Icon name="plus" size={14} />
            Create project
          </Button>
        }
        title="Projects"
      />
      <div className="max-w-page mx-auto w-full px-4 pt-2 pb-24">
        <div className="flex flex-col gap-5">
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
            <p className="text-body text-muted">
              Each project is one product you send events from.
            </p>
            {deleted.length > 0 ? (
              <Segment
                aria-label="Show"
                items={[
                  { content: "Active", id: "active" },
                  { content: `Deleted · ${deleted.length}`, id: "deleted" },
                ]}
                onSelectionChange={setView}
                selectedKey={shownView}
              />
            ) : null}
          </div>
          {renderBody()}
        </div>
      </div>

      {pending?.kind === "create" || pending?.kind === "edit" ? (
        <ProjectDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) {
              setPending(undefined);
            }
          }}
          project={pending.kind === "edit" ? pending.project : undefined}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Delete project"
        description={
          <>
            <span className="text-foreground font-medium">
              {pending?.kind === "delete" ? pending.project.name : ""}
            </span>{" "}
            and its channels leave the feed, and its API keys stop working. You
            can restore it from Deleted until it’s permanently removed.
          </>
        }
        isOpen={pending?.kind === "delete"}
        isPending={remove.isPending}
        onConfirm={() =>
          pending?.kind === "delete" && remove.mutate(pending.project)
        }
        onOpenChange={(open) => {
          if (!open) {
            setPending(undefined);
          }
        }}
        title="Delete this project?"
      />
    </>
  );
};
