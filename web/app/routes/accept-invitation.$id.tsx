import { authClient, unwrap } from "@app/lib/auth-client";
import { errorMessage } from "@app/lib/errors";
import { usePageTitle } from "@app/lib/page-title";
import { requireSession, resetWorkspaceCaches } from "@app/lib/session";
import { Button, Spinner, toast } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Wordmark } from "@ui/brand-mark";
import { EmptyState } from "@ui/empty-state";
import { hueFor, initialsFor, MemberAvatar } from "@ui/member-avatar";

const ROLE_LABELS: Record<string, string> = {
  admin: "an admin",
  member: "a member",
  owner: "an owner",
};

const VERIFICATION_REQUIRED = /verif/iu;

/** Better Auth only lets a verified address see or accept its invitations. */
const needsVerification = (error: unknown) =>
  error instanceof Error && VERIFICATION_REQUIRED.test(error.message);

const VerifyToAccept = ({ email }: { email: string }) => {
  const send = useMutation({
    mutationFn: () =>
      unwrap(
        authClient.sendVerificationEmail({
          callbackURL: window.location.href,
          email,
        })
      ),
    onError: (error) =>
      toast.danger(errorMessage(error, "The email couldn't be sent.")),
    onSuccess: () => toast.success(`Verification link sent to ${email}`),
  });
  return (
    <EmptyState
      action={
        <Button
          isDisabled={send.isSuccess}
          isPending={send.isPending}
          onPress={() => send.mutate()}
        >
          {send.isSuccess ? "Check your inbox" : "Send verification email"}
        </Button>
      }
      description={`Verify ${email} to accept this invitation. The link in the email brings you straight back here.`}
      icon="mail"
      title="Verify your email first"
      variant="dashed"
    />
  );
};

const InvitationCard = () => {
  const { id } = Route.useParams();
  const { viewer } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invitation = useQuery({
    queryFn: () =>
      unwrap(authClient.organization.getInvitation({ query: { id } })),
    // Not under ["auth"]: Better Auth UI toasts every failed query there,
    // and "verify first" or "not found" are answers this page shows itself.
    queryKey: ["invitation", id],
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () =>
      unwrap(authClient.organization.acceptInvitation({ invitationId: id })),
    onError: (error) =>
      toast.danger(errorMessage(error, "The invitation couldn't be accepted.")),
    onSuccess: async () => {
      const slug = invitation.data?.organizationSlug;
      toast.success(
        `You joined ${invitation.data?.organizationName ?? "the organization"}`
      );
      await resetWorkspaceCaches(queryClient);
      await (slug
        ? navigate({ params: { org: slug }, to: "/$org" })
        : navigate({ to: "/" }));
    },
  });
  const reject = useMutation({
    mutationFn: () =>
      unwrap(authClient.organization.rejectInvitation({ invitationId: id })),
    onError: (error) =>
      toast.danger(errorMessage(error, "The invitation couldn't be declined.")),
    onSuccess: async () => {
      toast.success("Invitation declined");
      await navigate({ to: "/" });
    },
  });

  if (invitation.isPending) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner aria-label="Loading invitation" size="sm" />
      </div>
    );
  }
  if (invitation.isError && needsVerification(invitation.error)) {
    return <VerifyToAccept email={viewer.email} />;
  }
  if (invitation.isError || invitation.data.status !== "pending") {
    return (
      <EmptyState
        action={
          <Link
            className="text-accent-soft-foreground text-body no-underline hover:underline"
            to="/"
          >
            Go to your dashboard
          </Link>
        }
        description={
          invitation.isError
            ? `${errorMessage(invitation.error, "This invitation can't be opened.")} Invitations only work for the email address they were sent to (you're signed in as ${viewer.email}).`
            : "This invitation has already been used, cancelled, or has expired. Ask for a new one."
        }
        icon="mail"
        title="Invitation unavailable"
        variant="dashed"
      />
    );
  }

  const { inviterEmail, organizationName, role } = invitation.data;
  return (
    <div className="border-border bg-surface rounded-3xl border p-7 shadow-sm">
      <MemberAvatar
        className="rounded-xl"
        hue={hueFor(invitation.data.organizationId)}
        initials={initialsFor(organizationName)}
        size="lg"
      />
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
        Join {organizationName}
      </h1>
      <p className="text-body text-muted mt-2">
        {inviterEmail} invited you to join as {ROLE_LABELS[role] ?? role}.
        You’re signed in as{" "}
        <span className="text-foreground font-medium">{viewer.email}</span>.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          isDisabled={reject.isPending}
          isPending={accept.isPending}
          onPress={() => accept.mutate()}
        >
          Accept invitation
        </Button>
        <Button
          isDisabled={accept.isPending}
          isPending={reject.isPending}
          onPress={() => reject.mutate()}
          variant="tertiary"
        >
          Decline
        </Button>
      </div>
    </div>
  );
};

const AcceptInvitationPage = () => {
  usePageTitle("Accept invitation");
  return (
    <main className="bg-background text-foreground min-h-svh px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-10">
      <div className="mx-auto w-full max-w-md">
        <a
          aria-label="EmitKit home"
          className="mb-10 flex w-fit items-center no-underline"
          href="/"
        >
          <Wordmark className="h-7 w-auto" tone="auto" />
        </a>
        <InvitationCard />
      </div>
    </main>
  );
};

export const Route = createFileRoute("/accept-invitation/$id")({
  async beforeLoad({ context: { queryClient }, location }) {
    const session = await requireSession(queryClient, location.href);
    return { viewer: session.user };
  },
  component: AcceptInvitationPage,
});
