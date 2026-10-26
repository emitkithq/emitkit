import { TextAreaInput, TextInput } from "@app/components/fields";
import { errorMessage } from "@app/lib/errors";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, Modal, toast } from "@heroui/react";
import type { Project } from "@shared/rpc/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const PROTOCOL = /^[a-z][a-z\d+.-]*:\/\//iu;

/** `acme.com` becomes `https://acme.com`; blank stays blank. */
export const normalizeUrl = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return PROTOCOL.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const isValidUrl = (value: string | undefined) => {
  if (!value) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/** Create a project, or edit one when `project` is given. */
export const ProjectDialog = ({
  isOpen,
  onOpenChange,
  project,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project?: Project | undefined;
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(project?.name ?? "");
  const [url, setUrl] = useState(project?.url ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [urlError, setUrlError] = useState<string>();

  const save = useMutation({
    mutationFn: () => {
      const normalizedUrl = normalizeUrl(url);
      const trimmedDescription = description.trim();
      if (project) {
        return rpc.projects.update({
          description: trimmedDescription || null,
          id: project.id,
          name: name.trim(),
          url: normalizedUrl ?? null,
        });
      }
      return rpc.projects.create({
        name: name.trim(),
        ...(normalizedUrl ? { url: normalizedUrl } : {}),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });
    },
    onError: (error) =>
      toast.danger(
        errorMessage(
          error,
          project
            ? "The project couldn't be saved."
            : "The project couldn't be created."
        )
      ),
    onSuccess: async (saved) => {
      toast.success(project ? `Saved ${saved.name}` : `Created ${saved.name}`);
      onOpenChange(false);
      if (!project) {
        setName("");
        setUrl("");
        setDescription("");
      }
      await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
    },
  });

  const submit = () => {
    if (!isValidUrl(normalizeUrl(url))) {
      setUrlError("Enter a valid website address, like https://acme.com.");
      return;
    }
    setUrlError(undefined);
    save.mutate();
  };

  const title = project ? "Edit project" : "Create project";

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container placement="center" size="md">
        <Modal.Dialog aria-label={title}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
              <p className="text-muted text-body mt-1">
                A project groups the channels one product sends events to.
              </p>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4 py-4">
              <TextInput
                autoComplete="off"
                label="Project name"
                maxLength={255}
                onValueChange={setName}
                placeholder="Acme Cloud"
                required
                value={name}
              />
              <TextInput
                autoComplete="url"
                error={urlError}
                inputMode="url"
                label="Website URL"
                maxLength={500}
                onValueChange={setUrl}
                placeholder="https://acme.com"
                value={url}
              />
              <TextAreaInput
                label="Description"
                maxLength={2000}
                onValueChange={setDescription}
                placeholder="What this project is, for whoever reads the feed"
                rows={3}
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
                isDisabled={!name.trim()}
                isPending={save.isPending}
                type="submit"
              >
                {project ? "Save project" : "Create project"}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
