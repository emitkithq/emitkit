import { ConfirmDialog } from "@app/components/confirm-dialog";
import { TextInput } from "@app/components/fields";
import { SelectField } from "@app/components/select-field";
import {
  SettingsCard,
  SettingsNote,
  SettingsSection,
} from "@app/components/settings-primitives";
import { authClient } from "@app/lib/auth-client";
import { errorMessage } from "@app/lib/errors";
import { dateAndTime } from "@app/lib/format";
import { useSession } from "@better-auth-ui/react";
import {
  useCancelInvitation,
  useInviteMember,
  useListOrganizationInvitations,
  useListOrganizationMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "@better-auth-ui/react/plugins/organization";
import { Button, Spinner, toast } from "@heroui/react";
import { Badge } from "@ui/badge";
import { Icon } from "@ui/icon";
import { hueFor, initialsFor, MemberAvatar } from "@ui/member-avatar";
import { useState } from "react";

type Role = "admin" | "member" | "owner";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  owner: "Owner",
};

const isRole = (value: string): value is Role =>
  value === "admin" || value === "member" || value === "owner";

const roleLabel = (role: string) =>
  role
    .split(",")
    .map((part) =>
      isRole(part.trim()) ? ROLE_LABELS[part.trim() as Role] : part
    )
    .join(", ");

const roleOptions = (viewerRole: string | undefined) =>
  (viewerRole === "owner"
    ? (["member", "admin", "owner"] as const)
    : (["member", "admin"] as const)
  ).map((role) => ({
    label: ROLE_LABELS[role],
    value: role,
  }));

interface MemberView {
  email: string;
  id: string;
  name: string;
  role: string;
  userId: string;
}

/**
 * Members and invitations of the active organization, through Better Auth's
 * organization plugin (shared cache with Better Auth UI).
 */
export const MembersSection = ({
  organizationId,
}: {
  organizationId: string;
}) => {
  const { data: session } = useSession(authClient);
  const query = { query: { organizationId } };
  const members = useListOrganizationMembers(authClient, query);
  const invitations = useListOrganizationInvitations(authClient, query);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [pendingRemoval, setPendingRemoval] = useState<MemberView>();

  const invite = useInviteMember(authClient);
  const updateRole = useUpdateMemberRole(authClient);
  const remove = useRemoveMember(authClient);
  const cancel = useCancelInvitation(authClient);

  const memberList: MemberView[] = (members.data?.members ?? []).map(
    (member) => ({
      email: member.user.email,
      id: member.id,
      name: member.user.name,
      role: member.role,
      userId: member.userId,
    })
  );
  const viewerRole = memberList.find(
    (member) => member.userId === session?.user.id
  )?.role;
  const canManage = viewerRole === "owner" || viewerRole === "admin";
  const ownerCount = memberList.filter(
    (member) => member.role === "owner"
  ).length;
  const pendingInvitations = (invitations.data ?? []).filter(
    (invitation) => invitation.status === "pending"
  );

  const sendInvite = () =>
    invite.mutate(
      { email: email.trim(), organizationId, role: inviteRole },
      {
        onError: (error) =>
          toast.danger(errorMessage(error, "The invitation couldn't be sent.")),
        onSuccess: () => {
          toast.success(`Invitation sent to ${email.trim()}`);
          setEmail("");
          setInviteRole("member");
        },
      }
    );

  if (members.isPending) {
    return (
      <SettingsSection title="Members">
        <SettingsCard>
          <div className="grid place-items-center py-8">
            <Spinner aria-label="Loading members" size="sm" />
          </div>
        </SettingsCard>
      </SettingsSection>
    );
  }
  if (members.isError) {
    return (
      <SettingsSection title="Members">
        <SettingsCard>
          <SettingsNote tone="danger">
            {errorMessage(members.error, "Members couldn't be loaded.")}
          </SettingsNote>
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <>
      {canManage ? (
        <SettingsSection
          description="They'll get an email with a link to join this organization."
          title="Invite members"
        >
          <SettingsCard>
            <form
              className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_minmax(0,10rem)_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                if (email.trim()) {
                  sendInvite();
                }
              }}
            >
              <TextInput
                autoComplete="email"
                label="Email"
                maxLength={320}
                onValueChange={setEmail}
                placeholder="alex@company.com"
                required
                type="email"
                value={email}
              />
              <SelectField
                label="Role"
                onValueChange={(value) =>
                  setInviteRole(isRole(value) ? value : "member")
                }
                options={roleOptions(viewerRole)}
                value={inviteRole}
              />
              <Button
                isDisabled={!email.trim()}
                isPending={invite.isPending}
                type="submit"
              >
                Send invitation
              </Button>
            </form>
          </SettingsCard>
        </SettingsSection>
      ) : null}

      {canManage ? (
        <SettingsSection
          title={`Pending invitations · ${pendingInvitations.length}`}
        >
          <SettingsCard>
            {invitations.isPending ? (
              <SettingsNote>Loading invitations…</SettingsNote>
            ) : null}
            {invitations.isError ? (
              <SettingsNote tone="danger">
                {errorMessage(
                  invitations.error,
                  "Invitations couldn't be loaded."
                )}
              </SettingsNote>
            ) : null}
            {invitations.isSuccess && pendingInvitations.length === 0 ? (
              <SettingsNote>No open invitations.</SettingsNote>
            ) : null}
            {pendingInvitations.length > 0 ? (
              <ul aria-label="Pending invitations">
                {pendingInvitations.map((invitation) => (
                  <li
                    className="border-separator flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0"
                    key={invitation.id}
                  >
                    <span
                      aria-hidden="true"
                      className="bg-default-soft text-muted grid size-7 shrink-0 place-items-center rounded-full"
                    >
                      <Icon name="mail" size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground text-body truncate">
                        {invitation.email}
                      </p>
                      <p className="text-muted text-meta">
                        Expires{" "}
                        {dateAndTime(
                          new Date(invitation.expiresAt).toISOString()
                        )}
                      </p>
                    </div>
                    <Badge>{roleLabel(invitation.role)}</Badge>
                    <Button
                      aria-label={`Cancel invitation for ${invitation.email}`}
                      isPending={
                        cancel.isPending &&
                        cancel.variables?.invitationId === invitation.id
                      }
                      onPress={() =>
                        cancel.mutate(
                          { invitationId: invitation.id },
                          {
                            onError: (error) =>
                              toast.danger(
                                errorMessage(
                                  error,
                                  "The invitation couldn't be cancelled."
                                )
                              ),
                            onSuccess: () =>
                              toast.success(
                                `Cancelled the invitation for ${invitation.email}`
                              ),
                          }
                        )
                      }
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </SettingsCard>
        </SettingsSection>
      ) : null}

      <SettingsSection
        description={
          canManage
            ? undefined
            : "Only owners and admins can invite people or change roles."
        }
        title={`Members · ${memberList.length}`}
      >
        <SettingsCard>
          <ul aria-label="Members">
            {memberList.map((member) => {
              const isViewer = member.userId === session?.user.id;
              const isLastOwner = member.role === "owner" && ownerCount <= 1;
              const canEdit =
                canManage &&
                !isViewer &&
                (viewerRole === "owner" || member.role !== "owner");
              return (
                <li
                  className="border-separator flex flex-wrap items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                  key={member.id}
                >
                  <MemberAvatar
                    hue={hueFor(member.userId)}
                    initials={initialsFor(member.name, member.email)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-body truncate">
                      {member.name || member.email}
                      {isViewer ? (
                        <span className="text-muted"> (you)</span>
                      ) : null}
                    </p>
                    <p className="text-muted text-meta truncate">
                      {member.email}
                    </p>
                  </div>
                  {canEdit && isRole(member.role) ? (
                    <SelectField
                      className="w-32"
                      compact
                      hideLabel
                      isDisabled={updateRole.isPending || isLastOwner}
                      label={`Role for ${member.name || member.email}`}
                      onValueChange={(role) =>
                        updateRole.mutate(
                          {
                            memberId: member.id,
                            organizationId,
                            role: isRole(role) ? role : "member",
                          },
                          {
                            onError: (error) =>
                              toast.danger(
                                errorMessage(
                                  error,
                                  "The role couldn't be changed."
                                )
                              ),
                            onSuccess: () =>
                              toast.success(
                                `${member.name || member.email} is now ${roleLabel(role)}`
                              ),
                          }
                        )
                      }
                      options={roleOptions(viewerRole)}
                      value={member.role}
                    />
                  ) : (
                    <Badge
                      tone={member.role === "owner" ? "accent" : "neutral"}
                    >
                      {roleLabel(member.role)}
                    </Badge>
                  )}
                  {canEdit && !isLastOwner ? (
                    <Button
                      aria-label={`Remove ${member.name || member.email}`}
                      isIconOnly
                      onPress={() => setPendingRemoval(member)}
                      size="sm"
                      variant="ghost"
                    >
                      <Icon name="trash" size={14} />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </SettingsCard>
      </SettingsSection>

      <ConfirmDialog
        confirmLabel="Remove member"
        description={`${pendingRemoval?.name || pendingRemoval?.email || "This person"} loses access to this organization immediately.`}
        isOpen={pendingRemoval !== undefined}
        isPending={remove.isPending}
        onConfirm={() =>
          pendingRemoval &&
          remove.mutate(
            { memberIdOrEmail: pendingRemoval.id, organizationId },
            {
              onError: (error) =>
                toast.danger(
                  errorMessage(error, "The member couldn't be removed.")
                ),
              onSuccess: () => {
                toast.success(
                  `Removed ${pendingRemoval.name || pendingRemoval.email}`
                );
                setPendingRemoval(undefined);
              },
            }
          )
        }
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoval(undefined);
          }
        }}
        title="Remove this member?"
      />
    </>
  );
};
