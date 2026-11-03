import { errorMessage } from "@app/lib/errors";
import {
  approve,
  deny,
  fetchPublicClient,
  forgetOAuthQuery,
} from "@app/lib/oauth";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, Spinner } from "@heroui/react";
import type { OAuthOrganizationChoice } from "@shared/rpc/schemas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@ui/badge";
import { AppIcon, Wordmark } from "@ui/brand-mark";
import { cn } from "@ui/cn";
import { Icon } from "@ui/icon";
import type { IconName } from "@ui/icon";
import { useState } from "react";

interface ConsentScreenProps {
  /** The page's query: the provider's signed authorization request. */
  readonly search: string;
  readonly email: string;
  readonly onSwitchAccount: () => void;
}

const hostOf = (uri: string | null) =>
  uri && URL.canParse(uri) ? new URL(uri).hostname : null;

/** The app's tile: its initial, never a remote logo (anyone can register a name). */
const ClientTile = ({ name }: { name: string }) => (
  <span
    aria-hidden="true"
    className="bg-default-soft text-foreground grid size-14 place-items-center rounded-2xl text-[22px] font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
  >
    {name.trim().charAt(0).toUpperCase() || "?"}
  </span>
);

const Connection = ({ name }: { name: string }) => (
  <div aria-hidden="true" className="flex items-center justify-center gap-3">
    <ClientTile name={name} />
    <span className="flex items-center gap-1.5">
      <span className="bg-border size-1 rounded-full" />
      <span className="bg-border size-1 rounded-full" />
      <span className="bg-accent text-accent-foreground grid size-6 place-items-center rounded-full">
        <Icon name="check" size={13} />
      </span>
      <span className="bg-border size-1 rounded-full" />
      <span className="bg-border size-1 rounded-full" />
    </span>
    <AppIcon className="size-14 rounded-2xl shadow-sm" />
  </div>
);

const Permission = ({
  icon,
  children,
}: {
  icon: IconName;
  children: string;
}) => (
  <li className="text-body text-foreground flex items-start gap-3">
    <span className="bg-default-soft text-muted mt-px grid size-6 shrink-0 place-items-center rounded-full">
      <Icon name={icon} size={13} />
    </span>
    <span className="leading-6">{children}</span>
  </li>
);

const ProjectPicker = ({
  onChange,
  organizations,
  value,
}: {
  onChange: (projectId: string) => void;
  organizations: readonly OAuthOrganizationChoice[];
  value: string;
}) => (
  <fieldset className="m-0 min-w-0 border-0 p-0">
    <legend className="text-meta text-muted mb-2 font-medium tracking-wide uppercase">
      Project
    </legend>
    <div className="grid gap-4">
      {organizations.map((organization) => (
        <div key={organization.id}>
          <p className="text-meta text-muted mb-1.5 flex items-center gap-2">
            <Icon name="building" size={12} />
            {organization.name}
          </p>
          {organization.canConnect ? null : (
            <p className="text-meta text-muted mb-1.5">
              Only owners and admins can connect apps to this organization.
            </p>
          )}
          {organization.projects.length === 0 ? (
            <p className="text-meta text-muted">No projects yet.</p>
          ) : (
            <div className="border-border divide-separator divide-y overflow-hidden rounded-xl border">
              {organization.projects.map((project) => {
                const disabled = !organization.canConnect;
                const checked = value === project.id;
                return (
                  <label
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-3 transition-colors",
                      disabled
                        ? "cursor-not-allowed opacity-55"
                        : "hover:bg-default-soft cursor-pointer",
                      checked && "bg-accent-soft"
                    )}
                    key={project.id}
                  >
                    <input
                      checked={checked}
                      className="accent-accent size-4 shrink-0"
                      disabled={disabled}
                      name="project"
                      onChange={() => onChange(project.id)}
                      type="radio"
                      value={project.id}
                    />
                    <span className="text-body text-foreground min-w-0 flex-1 truncate">
                      {project.name}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  </fieldset>
);

/**
 * The OAuth consent screen: which app, which account, which project, what
 * it may do, and where the browser goes next. Owners and admins only, since
 * a connected app can write events and erase users like an API key.
 */
export const ConsentScreen = ({
  email,
  onSwitchAccount,
  search,
}: ConsentScreenProps) => {
  const params = new URLSearchParams(search);
  const clientId = params.get("client_id") ?? "";
  const returnHost = hostOf(params.get("redirect_uri"));
  const scopes = new Set((params.get("scope") ?? "").split(" "));
  const wantsIdentity = ["openid", "profile", "email"].some((scope) =>
    scopes.has(scope)
  );

  const client = useQuery({
    queryFn: () => fetchPublicClient(clientId),
    queryKey: ["oauth", "public-client", clientId],
    retry: false,
  });
  const choices = useQuery(orpc.oauth.choices.queryOptions());
  const organizations = choices.data?.organizations ?? [];
  const selectable = organizations
    .filter((organization) => organization.canConnect)
    .flatMap((organization) =>
      organization.projects.map((project) => ({ organization, project }))
    );
  const [picked, setPicked] = useState("");
  const selection =
    selectable.find(({ project }) => project.id === picked) ?? selectable[0];

  const authorize = useMutation({
    mutationFn: async () => {
      if (!selection) {
        throw new Error("Pick a project first.");
      }
      await rpc.oauth.select({ projectId: selection.project.id });
      return await approve(search);
    },
    onSuccess: (next) => {
      forgetOAuthQuery();
      window.location.assign(next.href);
    },
  });
  const cancel = useMutation({
    mutationFn: () => deny(search),
    onSuccess: (next) => {
      forgetOAuthQuery();
      window.location.assign(next.href);
    },
  });
  // Someone without a workspace gets one made here, as the dashboard would
  // make it on their first visit, and picks its project without leaving.
  const createWorkspace = useMutation({
    mutationFn: () => rpc.gettingStarted.ensureWorkspace(),
    onSuccess: () => choices.refetch(),
  });
  const busy =
    authorize.isPending || cancel.isPending || createWorkspace.isPending;
  const failure =
    authorize.error ?? cancel.error ?? createWorkspace.error ?? client.error;

  const appName = client.data?.name ?? "This app";
  const renderBody = () => {
    if (client.isPending || choices.isPending) {
      return (
        <div className="grid h-64 place-items-center">
          <Spinner aria-label="Loading" size="sm" />
        </div>
      );
    }
    if (client.isError) {
      return (
        <p className="text-body text-muted text-center" role="alert">
          {errorMessage(
            client.error,
            "This app isn't registered with EmitKit."
          )}
        </p>
      );
    }
    return (
      <>
        <div className="mt-7 grid gap-6">
          {organizations.length === 0 ? (
            <div className="border-border rounded-xl border border-dashed p-4 text-center">
              <p className="text-body text-foreground font-medium">
                You have no workspace yet
              </p>
              <p className="text-meta text-muted mt-1">
                Create one with a project to connect {appName} to.
              </p>
              <Button
                className="mt-3"
                isDisabled={busy}
                isPending={createWorkspace.isPending}
                onPress={() => createWorkspace.mutate()}
                size="sm"
                variant="secondary"
              >
                Create a workspace
              </Button>
            </div>
          ) : (
            <ProjectPicker
              onChange={setPicked}
              organizations={organizations}
              value={selection?.project.id ?? ""}
            />
          )}

          <div>
            <p className="text-meta text-muted mb-2.5 font-medium tracking-wide uppercase">
              {appName} will be able to
            </p>
            <ul className="m-0 grid list-none gap-2.5 p-0">
              <Permission icon="send">
                {`Send events to ${selection?.project.name ?? "the project"}`}
              </Permission>
              <Permission icon="bell">
                {`Hear about new events in ${selection?.project.name ?? "the project"} as they happen`}
              </Permission>
              <Permission icon="users">
                {`Identify and erase users in ${selection?.organization.name ?? "the organization"}`}
              </Permission>
              {wantsIdentity ? (
                <Permission icon="user">
                  See your name and email address
                </Permission>
              ) : null}
            </ul>
          </div>
        </div>

        {failure ? (
          <p
            className="border-orb-coral/30 bg-orb-coral/10 text-orb-coral text-body mt-6 rounded-xl border p-3"
            role="alert"
          >
            {errorMessage(failure, "The authorization couldn't continue.")}
          </p>
        ) : null}

        <div className="mt-7 grid grid-cols-2 gap-2.5">
          <Button
            className="w-full"
            isDisabled={busy}
            isPending={cancel.isPending}
            onPress={() => cancel.mutate()}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            className="w-full"
            isDisabled={busy || !selection}
            isPending={authorize.isPending}
            onPress={() => authorize.mutate()}
          >
            Authorize
          </Button>
        </div>
        <p className="text-meta text-muted mt-4 text-center leading-relaxed">
          {returnHost ? (
            <>
              You will be sent back to{" "}
              <span className="text-foreground font-medium">{returnHost}</span>
              .{" "}
            </>
          ) : null}
          You can revoke access at any time in Settings → Connected apps.
        </p>
      </>
    );
  };

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <header className="flex items-center justify-between">
        <a
          aria-label="EmitKit home"
          className="flex items-center no-underline"
          href="/"
        >
          <Wordmark className="h-6 w-auto" tone="auto" />
        </a>
      </header>
      <main className="flex flex-1 items-start justify-center pt-8 sm:items-center sm:pt-0">
        <div className="border-border bg-surface w-full max-w-[440px] rounded-3xl border p-6 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.35)] sm:p-8">
          <Connection name={appName} />
          <div className="mt-6 text-center">
            <h1 className="text-foreground text-[22px] leading-tight font-semibold tracking-[-0.02em] text-balance">
              Connect {appName}
            </h1>
            <p className="text-body text-muted mt-2">
              {appName} wants to use EmitKit on your behalf.
            </p>
            {client.data ? (
              // Anyone can register an app under any name; where the browser
              // goes back to is what identifies it.
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Badge tone="neutral">Unverified app</Badge>
                {returnHost ? (
                  <span className="text-meta text-muted">
                    returns to {returnHost}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="bg-default-soft mt-6 flex items-center gap-3 rounded-xl px-3.5 py-2.5">
            <Icon className="text-muted" name="user" size={15} />
            <span className="text-body text-foreground min-w-0 flex-1 truncate">
              {email}
            </span>
            <button
              className="text-meta text-accent shrink-0 font-medium hover:underline"
              onClick={onSwitchAccount}
              type="button"
            >
              Switch account
            </button>
          </div>

          {renderBody()}
        </div>
      </main>
    </div>
  );
};
