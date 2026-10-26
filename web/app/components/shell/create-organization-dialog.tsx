import { TextInput } from "@app/components/fields";
import { authClient, unwrap } from "@app/lib/auth-client";
import { errorMessage } from "@app/lib/errors";
import { isReservedSlug } from "@app/lib/reserved-slugs";
import { resetWorkspaceCaches } from "@app/lib/session";
import { generateOrganizationSlug } from "@better-auth-ui/core/plugins/organization";
import { Button, Modal, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

const SUFFIX_LENGTH = 4;

const randomSuffix = () =>
  crypto
    .getRandomValues(new Uint32Array(1))[0]
    ?.toString(36)
    .slice(0, SUFFIX_LENGTH) ?? "team";

/** A free slug derived from the name, suffixed when the plain one is taken. */
const availableSlug = async (name: string): Promise<string> => {
  const slug = generateOrganizationSlug(name);
  if (isReservedSlug(slug)) {
    return generateOrganizationSlug(name, randomSuffix());
  }
  const { data } = await authClient.organization.checkSlug({ slug });
  return data?.status ? slug : generateOrganizationSlug(name, randomSuffix());
};

export const CreateOrganizationDialog = ({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) => {
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async (organizationName: string) => {
      const slug = await availableSlug(organizationName);
      return unwrap(
        authClient.organization.create({ name: organizationName, slug })
      );
    },
    onError: (error) =>
      toast.danger(
        errorMessage(error, "The organization couldn't be created.")
      ),
    onSuccess: async (organization) => {
      toast.success(`${organization.name} is ready`);
      onOpenChange(false);
      setName("");
      await resetWorkspaceCaches(queryClient);
      await navigate({ params: { org: organization.slug }, to: "/$org" });
    },
  });

  const trimmed = name.trim();

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog aria-label="Create organization">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (trimmed) {
                create.mutate(trimmed);
              }
            }}
          >
            <Modal.Header>
              <Modal.Heading>Create organization</Modal.Heading>
              <p className="text-muted text-body mt-1">
                A separate workspace with its own projects, channels, API keys
                and members.
              </p>
            </Modal.Header>
            <Modal.Body className="py-4">
              <TextInput
                autoComplete="organization"
                label="Organization name"
                maxLength={255}
                onValueChange={setName}
                placeholder="Acme"
                required
                value={name}
              />
            </Modal.Body>
            <Modal.Footer>
              <Button
                isDisabled={create.isPending}
                slot="close"
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button
                isDisabled={!trimmed}
                isPending={create.isPending}
                type="submit"
              >
                Create organization
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
