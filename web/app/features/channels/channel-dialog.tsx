import { TextAreaInput, TextInput } from "@app/components/fields";
import { SelectField } from "@app/components/select-field";
import { EmojiField } from "@app/features/channels/emoji-field";
import { errorMessage } from "@app/lib/errors";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, Modal, toast } from "@heroui/react";
import type { Channel, Project } from "@shared/rpc/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/** What the dialog is for, and why a channel's name can't change. */
const Intro = ({ projectName }: { projectName: string | undefined }) =>
  projectName === undefined ? (
    <>
      Send events to it by name with{" "}
      <code className="text-meta font-mono">channelName</code>. Events to a name
      that doesn’t exist yet create it too.
    </>
  ) : (
    <>
      In <span className="text-foreground font-medium">{projectName}</span>. Its
      name stays: it’s the{" "}
      <code className="text-meta font-mono">channelName</code> your code sends.
    </>
  );

interface ChannelDraft {
  description: string;
  icon: string | undefined;
  name: string;
  projectId: string;
}

const initialDraft = (
  channel: Channel | undefined,
  projectId: string | undefined
): ChannelDraft => ({
  description: channel?.description ?? "",
  icon: channel?.icon ?? undefined,
  name: channel?.name ?? "",
  projectId: channel?.projectId ?? projectId ?? "",
});

/** Creates a channel, or saves `channel`'s icon and description. */
const useSaveChannel = (channel: Channel | undefined, onSaved: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ description, icon, name, projectId }: ChannelDraft) => {
      const trimmedDescription = description.trim();
      if (channel) {
        return rpc.channels.update({
          description: trimmedDescription || null,
          icon: icon ?? null,
          id: channel.id,
        });
      }
      return rpc.channels.create({
        name: name.trim(),
        projectId,
        ...(icon ? { icon } : {}),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });
    },
    onError: (error) =>
      toast.danger(
        errorMessage(
          error,
          channel
            ? "The channel couldn't be saved."
            : "The channel couldn't be created."
        )
      ),
    onSuccess: async (saved) => {
      toast.success(
        channel ? `Saved #${saved.name}` : `Created #${saved.name}`
      );
      onSaved();
      await queryClient.invalidateQueries({ queryKey: orpc.channels.key() });
    },
  });
};

/**
 * Create a channel in one of `projects`, or edit `channel`'s icon and
 * description. A channel's name is the `channelName` senders use, so it is
 * set once, at creation.
 */
export const ChannelDialog = ({
  channel,
  defaultProjectId,
  isOpen,
  onOpenChange,
  projects,
}: {
  channel?: Channel | undefined;
  defaultProjectId?: string | undefined;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projects: readonly Project[];
}) => {
  const initial = initialDraft(channel, defaultProjectId ?? projects[0]?.id);
  const [name, setName] = useState(initial.name);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [icon, setIcon] = useState(initial.icon);
  const [description, setDescription] = useState(initial.description);
  const project = projects.find((candidate) => candidate.id === projectId);

  const save = useSaveChannel(channel, () => onOpenChange(false));

  const title = channel ? `Edit #${channel.name}` : "Create channel";
  const canSubmit = channel ? true : Boolean(name.trim() && projectId);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container placement="center" size="md">
        <Modal.Dialog aria-label={title}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) {
                save.mutate({ description, icon, name, projectId });
              }
            }}
          >
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
              <p className="text-body text-muted mt-1">
                <Intro
                  projectName={
                    channel ? (project?.name ?? "its project") : undefined
                  }
                />
              </p>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4 py-4">
              {channel ? null : (
                <>
                  {projects.length > 1 ? (
                    <SelectField
                      label="Project"
                      onValueChange={setProjectId}
                      options={projects.map((candidate) => ({
                        label: candidate.name,
                        value: candidate.id,
                      }))}
                      required
                      value={projectId}
                    />
                  ) : null}
                  <TextInput
                    autoComplete="off"
                    label="Channel name"
                    maxLength={255}
                    onValueChange={setName}
                    placeholder="payments"
                    required
                    value={name}
                  />
                </>
              )}
              <EmojiField channelName={name} onChange={setIcon} value={icon} />
              <TextAreaInput
                label="Description"
                maxLength={2000}
                onValueChange={setDescription}
                placeholder="What lands here"
                rows={2}
                value={description}
              />
            </Modal.Body>
            <Modal.Footer>
              <Button
                isDisabled={save.isPending}
                slot="close"
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isDisabled={!canSubmit}
                isPending={save.isPending}
                type="submit"
              >
                {channel ? "Save channel" : "Create channel"}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
