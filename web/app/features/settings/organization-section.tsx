import { TextInput } from "@app/components/fields";
import {
  SettingsCard,
  SettingsSection,
} from "@app/components/settings-primitives";
import { authClient, unwrap } from "@app/lib/auth-client";
import { errorMessage } from "@app/lib/errors";
import { isReservedSlug } from "@app/lib/reserved-slugs";
import type { WorkspaceOrganization } from "@app/lib/session";
import { organizationQueryKeys } from "@better-auth-ui/core/plugins/organization";
import { OrganizationDangerZone } from "@better-auth-ui/heroui/plugins/organization";
import { useSession } from "@better-auth-ui/react";
import { Button, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SLUG_INVALID = /[^a-z0-9-]+/gu;
const SLUG_DASHES = /-{2,}/gu;
const SLUG_EDGES = /^-|-$/gu;

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(SLUG_INVALID, "-")
    .replace(SLUG_DASHES, "-")
    .replace(SLUG_EDGES, "");

const OrganizationProfileCard = ({
  canManage,
  organization,
}: {
  canManage: boolean;
  organization: WorkspaceOrganization;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: session } = useSession(authClient);
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const slugError = (() => {
    if (slug && !SLUG_PATTERN.test(slug)) {
      return "Use lowercase letters, numbers and single dashes.";
    }
    return isReservedSlug(slug)
      ? `“${slug}” is reserved. Choose another slug.`
      : undefined;
  })();
  const isDirty =
    name.trim() !== organization.name || slug !== organization.slug;

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        authClient.organization.update({
          data: {
            name: name.trim(),
            ...(slug === organization.slug ? {} : { slug }),
          },
          organizationId: organization.id,
        })
      ),
    onError: (error) =>
      toast.danger(errorMessage(error, "The organization couldn't be saved.")),
    onSuccess: async (updated) => {
      toast.success("Organization saved");
      await queryClient.invalidateQueries({
        queryKey: organizationQueryKeys.all(session?.user.id),
      });
      if (updated.slug !== organization.slug) {
        // Same page, same open settings section, new slug.
        await navigate({
          params: (prev) => ({ ...prev, org: updated.slug }),
          replace: true,
          search: (prev) => prev,
          to: ".",
        });
      }
    },
  });

  return (
    <SettingsSection
      description="The name people see, and the slug in your dashboard's address."
      title="Organization profile"
    >
      <SettingsCard>
        <form
          className="flex flex-col gap-4 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !slugError && isDirty) {
              save.mutate();
            }
          }}
        >
          <TextInput
            disabled={!canManage}
            label="Organization name"
            maxLength={255}
            onValueChange={setName}
            required
            value={name}
          />
          <TextInput
            description={`${window.location.host}/${slug || "…"}`}
            disabled={!canManage}
            error={slugError}
            label="Slug"
            maxLength={64}
            onValueChange={(value) => setSlug(toSlug(value))}
            required
            value={slug}
          />
          {canManage ? (
            <div className="flex justify-end">
              <Button
                isDisabled={!(isDirty && name.trim()) || Boolean(slugError)}
                isPending={save.isPending}
                size="sm"
                type="submit"
              >
                Save changes
              </Button>
            </div>
          ) : (
            <p className="text-meta text-muted">
              Only owners and admins can change these.
            </p>
          )}
        </form>
      </SettingsCard>
    </SettingsSection>
  );
};

/**
 * Rename or re-slug the organization (v2 settings style), then leave or
 * delete it through Better Auth UI's danger zone, which lands back on `/`.
 */
export const OrganizationSection = ({
  canManage,
  organization,
}: {
  canManage: boolean;
  organization: WorkspaceOrganization;
}) => (
  <>
    <OrganizationProfileCard
      canManage={canManage}
      key={`${organization.id}:${organization.slug}`}
      organization={organization}
    />
    <OrganizationDangerZone />
  </>
);
