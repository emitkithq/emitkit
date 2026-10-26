import { ConfirmDialog } from "@app/components/confirm-dialog";
import { TextInput } from "@app/components/fields";
import { OneTimeSecret } from "@app/components/one-time-secret";
import { SelectField } from "@app/components/select-field";
import {
  SettingsCard,
  SettingsNote,
  SettingsRow,
  SettingsSection,
} from "@app/components/settings-primitives";
import { docsUrl } from "@app/lib/api-url";
import { errorMessage } from "@app/lib/errors";
import { dateAndTime } from "@app/lib/format";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, Spinner, toast } from "@heroui/react";
import type { ApiKey, Project } from "@shared/rpc/schemas";
import type { KeyAccess } from "@shared/scopes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/badge";
import { EmptyState } from "@ui/empty-state";
import { Icon } from "@ui/icon";
import { useState } from "react";

interface RevealedSecret {
  apiKeyId: string;
  /** Revealed again later, rather than just created or rotated. */
  revealed?: boolean;
  title: string;
  value: string;
}

const REVEALED_DESCRIPTION =
  "Anyone with this key can send events to the project. Keep it in your secret manager.";

interface Confirmation {
  action: "revoke" | "rotate";
  apiKey: ApiKey;
}

const ApiKeyRow = ({
  apiKey,
  canManage,
  isRevealing,
  onDismissSecret,
  onRequest,
  onReveal,
  secret,
}: {
  apiKey: ApiKey;
  canManage: boolean;
  isRevealing: boolean;
  onDismissSecret: () => void;
  onRequest: (confirmation: Confirmation) => void;
  onReveal: (apiKey: ApiKey) => void;
  secret: RevealedSecret | undefined;
}) => (
  <li
    className="border-separator border-b last:border-b-0"
    data-testid="api-key-row"
  >
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
      <span
        aria-hidden="true"
        className="bg-default-soft text-muted grid size-8 shrink-0 place-items-center rounded-full"
      >
        <Icon name="key" size={14} />
      </span>
      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body text-foreground truncate">{apiKey.name}</h3>
          {apiKey.access === "read" ? <Badge>Read-only</Badge> : null}
          {apiKey.enabled ? null : <Badge tone="danger">Disabled</Badge>}
        </div>
        <p className="text-meta text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {apiKey.start ? (
            <code className="font-mono">{apiKey.start}…</code>
          ) : null}
          {apiKey.start ? <span aria-hidden="true">·</span> : null}
          <span>{apiKey.projectName ?? "No project"}</span>
          <span aria-hidden="true">·</span>
          <span>Created {dateAndTime(apiKey.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {apiKey.lastRequestAt
              ? `Last used ${dateAndTime(apiKey.lastRequestAt)}`
              : "Never used"}
          </span>
        </p>
      </div>
      {canManage ? (
        <div className="flex items-center gap-1">
          {apiKey.revealable && !secret ? (
            <Button
              aria-label={`Reveal ${apiKey.name}`}
              isPending={isRevealing}
              onPress={() => onReveal(apiKey)}
              size="sm"
              variant="ghost"
            >
              <Icon name="eye" size={14} />
              Reveal
            </Button>
          ) : null}
          <Button
            aria-label={`Rotate ${apiKey.name}`}
            onPress={() => onRequest({ action: "rotate", apiKey })}
            size="sm"
            variant="secondary"
          >
            Rotate
          </Button>
          <Button
            aria-label={`Revoke ${apiKey.name}`}
            onPress={() => onRequest({ action: "revoke", apiKey })}
            size="sm"
            variant="danger-soft"
          >
            Revoke
          </Button>
        </div>
      ) : null}
    </div>
    {secret ? (
      <div className="px-4 pb-3.5">
        <OneTimeSecret
          {...(secret.revealed ? { description: REVEALED_DESCRIPTION } : {})}
          onDismiss={onDismissSecret}
          secret={secret.value}
          title={secret.title}
        />
      </div>
    ) : null}
  </li>
);

const CreateApiKeyForm = ({
  onCreated,
  org,
  projects,
}: {
  onCreated: (secret: RevealedSecret) => void;
  org: string;
  projects: readonly Project[] | undefined;
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [access, setAccess] = useState<KeyAccess>("full");
  const liveProjects = (projects ?? []).filter((project) => !project.deletedAt);
  const selectedProjectId = projectId || liveProjects[0]?.id || "";

  const create = useMutation({
    gcTime: 0,
    mutationFn: () =>
      rpc.apiKeys.create({
        access,
        name: name.trim(),
        projectId: selectedProjectId,
      }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The API key couldn't be created.")),
    onSuccess: async ({ apiKey, secret }) => {
      onCreated({
        apiKeyId: apiKey.id,
        title: `Secret for ${apiKey.name}`,
        value: secret,
      });
      setName("");
      toast.success(`Created ${apiKey.name}`);
      await queryClient.invalidateQueries({ queryKey: orpc.apiKeys.key() });
    },
  });

  if (projects && liveProjects.length === 0) {
    return (
      <SettingsNote>
        Keys belong to a project. Create one first in{" "}
        <Link
          className="text-accent-soft-foreground no-underline hover:underline"
          params={{ org }}
          to="/$org/projects"
        >
          Projects
        </Link>
        .
      </SettingsNote>
    );
  }

  return (
    <form
      className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_minmax(0,12rem)_minmax(0,10rem)]"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() && selectedProjectId) {
          create.mutate();
        }
      }}
    >
      <TextInput
        autoComplete="off"
        label="Key name"
        maxLength={255}
        onValueChange={setName}
        placeholder="Production server"
        required
        value={name}
      />
      <SelectField
        isDisabled={projects === undefined}
        label="Project"
        onValueChange={setProjectId}
        options={liveProjects.map((project) => ({
          label: project.name,
          value: project.id,
        }))}
        required
        value={selectedProjectId}
      />
      <SelectField
        label="Access"
        onValueChange={(value) => setAccess(value === "read" ? "read" : "full")}
        options={[
          { label: "Full access", value: "full" },
          { label: "Read-only", value: "read" },
        ]}
        value={access}
      />
      <div className="flex items-center justify-between gap-3 sm:col-span-3">
        <p className="text-meta text-muted">
          {access === "read"
            ? "Read-only keys read events and channels, and can't send."
            : "The secret is shown once, right after you create the key."}
        </p>
        <Button
          isDisabled={!(name.trim() && selectedProjectId)}
          isPending={create.isPending}
          size="sm"
          type="submit"
        >
          Create API key
        </Button>
      </div>
    </form>
  );
};

const ApiKeyList = ({
  apiKeys,
  canManage,
  onDismissSecret,
  onRequest,
  onReveal,
  revealing,
  secret,
}: {
  apiKeys: readonly ApiKey[];
  canManage: boolean;
  onDismissSecret: () => void;
  onRequest: (confirmation: Confirmation) => void;
  onReveal: (apiKey: ApiKey) => void;
  revealing: string | null;
  secret: RevealedSecret | undefined;
}) => {
  // A brand-new key's secret can be on screen before its row has loaded in.
  const orphanSecret =
    secret && !apiKeys.some((apiKey) => apiKey.id === secret.apiKeyId)
      ? secret
      : undefined;
  if (apiKeys.length === 0 && !orphanSecret) {
    return (
      <EmptyState
        description={
          canManage
            ? "Create one for the first program that sends events."
            : "No keys yet."
        }
        icon="key"
        title="No API keys yet"
        variant="block"
      />
    );
  }
  return (
    <>
      {orphanSecret ? (
        <div className="px-4 py-3.5">
          <OneTimeSecret
            onDismiss={onDismissSecret}
            secret={orphanSecret.value}
            title={orphanSecret.title}
          />
        </div>
      ) : null}
      <ul aria-label="API keys">
        {apiKeys.map((apiKey) => (
          <ApiKeyRow
            apiKey={apiKey}
            canManage={canManage}
            isRevealing={revealing === apiKey.id}
            key={apiKey.id}
            onDismissSecret={onDismissSecret}
            onRequest={onRequest}
            onReveal={onReveal}
            secret={secret?.apiKeyId === apiKey.id ? secret : undefined}
          />
        ))}
      </ul>
    </>
  );
};

const CALLBACK_SECRET_DESCRIPTION =
  "EmitKit signs the callbacks of your questions with this secret (Standard Webhooks). Verify them with it; it's the same for every key of the project.";

/**
 * A project's callback signing secret (`whsec_…`), for owners and admins. Like
 * a revealed API key, it lives only in this component's state.
 */
const CallbackSecretSection = ({
  projects,
}: {
  projects: readonly Project[] | undefined;
}) => {
  const [projectId, setProjectId] = useState("");
  const [secret, setSecret] = useState<{ projectId: string; value: string }>();
  const liveProjects = (projects ?? []).filter((project) => !project.deletedAt);
  const selected =
    liveProjects.find((project) => project.id === projectId) ?? liveProjects[0];
  const shown = secret?.projectId === selected?.id ? secret : undefined;

  const reveal = useMutation({
    gcTime: 0,
    mutationFn: (project: Project) =>
      rpc.projects.callbackSecret({ id: project.id }),
    onError: (error) =>
      toast.danger(
        errorMessage(error, "The callback signing secret couldn't be revealed.")
      ),
    onSuccess: ({ secret: value }, project) =>
      setSecret({ projectId: project.id, value }),
  });

  if (projects && liveProjects.length === 0) {
    return null;
  }

  return (
    <SettingsSection
      description={
        <>
          {CALLBACK_SECRET_DESCRIPTION}{" "}
          <a
            className="text-accent-soft-foreground no-underline hover:underline"
            href={`${docsUrl()}/concepts/questions#callbacks`}
            rel="noreferrer"
            target="_blank"
          >
            How to verify
          </a>
        </>
      }
      title="Callback signing secret"
    >
      <SettingsCard>
        <SettingsRow
          description={
            selected && liveProjects.length === 1
              ? `For ${selected.name}`
              : undefined
          }
          label="Signing secret"
        >
          {liveProjects.length > 1 ? (
            <SelectField
              compact
              hideLabel
              label="Project"
              onValueChange={setProjectId}
              options={liveProjects.map((project) => ({
                label: project.name,
                value: project.id,
              }))}
              value={selected?.id ?? ""}
            />
          ) : null}
          {shown ? null : (
            <Button
              aria-label="Reveal callback signing secret"
              isDisabled={!selected}
              isPending={reveal.isPending}
              onPress={() => selected && reveal.mutate(selected)}
              size="sm"
              variant="secondary"
            >
              <Icon name="eye" size={14} />
              Reveal
            </Button>
          )}
        </SettingsRow>
        {shown && selected ? (
          <div className="px-4 pb-3.5">
            <OneTimeSecret
              copyLabel="Copy callback signing secret"
              description="Anyone with it can forge callbacks from EmitKit. Keep it in your secret manager."
              label="Callback signing secret"
              onDismiss={() => setSecret(undefined)}
              secret={shown.value}
              title={selected.name}
            />
          </div>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
};

/**
 * API keys, each bound to one project. A secret is shown exactly once, right
 * after it is created or rotated, and lives only in this component's state.
 */
export const ApiKeysSection = ({
  canManage,
  org,
}: {
  canManage: boolean;
  org: string;
}) => {
  const queryClient = useQueryClient();
  const apiKeys = useQuery(orpc.apiKeys.list.queryOptions());
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
  const [secret, setSecret] = useState<RevealedSecret>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.apiKeys.key() });

  const rotate = useMutation({
    gcTime: 0,
    mutationFn: (apiKey: ApiKey) => rpc.apiKeys.rotate({ id: apiKey.id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The API key couldn't be rotated.")),
    onSuccess: async ({ apiKey, secret: value }) => {
      setConfirmation(undefined);
      setSecret({
        apiKeyId: apiKey.id,
        title: `New secret for ${apiKey.name}`,
        value,
      });
      toast.success(`Rotated ${apiKey.name}`, {
        description: "The previous secret no longer works.",
      });
      await refresh();
    },
  });
  const reveal = useMutation({
    gcTime: 0,
    mutationFn: (apiKey: ApiKey) => rpc.apiKeys.reveal({ id: apiKey.id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The API key couldn't be revealed.")),
    onSuccess: ({ secret: value }, apiKey) =>
      setSecret({
        apiKeyId: apiKey.id,
        revealed: true,
        title: apiKey.name,
        value,
      }),
  });
  const revoke = useMutation({
    mutationFn: (apiKey: ApiKey) => rpc.apiKeys.revoke({ id: apiKey.id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "The API key couldn't be revoked.")),
    onSuccess: async (_result, apiKey) => {
      setConfirmation(undefined);
      setSecret((current) =>
        current?.apiKeyId === apiKey.id ? undefined : current
      );
      toast.success(`Revoked ${apiKey.name}`);
      await refresh();
    },
  });

  const confirmed = confirmation?.apiKey.name ?? "This key";
  const isRotate = confirmation?.action === "rotate";

  const renderKeys = () => {
    if (apiKeys.isPending) {
      return (
        <div className="grid place-items-center py-8">
          <Spinner aria-label="Loading API keys" size="sm" />
        </div>
      );
    }
    if (apiKeys.isError) {
      return (
        <SettingsNote tone="danger">
          {errorMessage(apiKeys.error, "API keys couldn't be loaded.")}
        </SettingsNote>
      );
    }
    return (
      <ApiKeyList
        apiKeys={apiKeys.data}
        canManage={canManage}
        onDismissSecret={() => setSecret(undefined)}
        onRequest={setConfirmation}
        onReveal={(apiKey) => reveal.mutate(apiKey)}
        revealing={reveal.isPending ? (reveal.variables?.id ?? null) : null}
        secret={secret}
      />
    );
  };

  return (
    <>
      {canManage ? (
        <SettingsSection
          description="Keys let your servers send events. Each key belongs to one project; give every integration its own."
          title="Create API key"
        >
          <SettingsCard>
            <CreateApiKeyForm
              onCreated={setSecret}
              org={org}
              projects={projects.data}
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}

      <SettingsSection
        description={
          canManage
            ? "Rotate a key to replace its secret; revoke it to stop it working immediately."
            : "Only owners and admins can create, rotate or revoke keys."
        }
        title={`API keys${apiKeys.data ? ` · ${apiKeys.data.length}` : ""}`}
      >
        <SettingsCard>{renderKeys()}</SettingsCard>
      </SettingsSection>

      {canManage ? <CallbackSecretSection projects={projects.data} /> : null}

      <ConfirmDialog
        confirmLabel={isRotate ? "Rotate key" : "Revoke key"}
        description={
          isRotate
            ? `The current secret for ${confirmed} stops working immediately. Update the integration with the new secret shown next.`
            : `${confirmed} stops working immediately. Revoking can’t be undone.`
        }
        isOpen={confirmation !== undefined}
        isPending={rotate.isPending || revoke.isPending}
        onConfirm={() => {
          if (confirmation?.action === "rotate") {
            rotate.mutate(confirmation.apiKey);
          } else if (confirmation) {
            revoke.mutate(confirmation.apiKey);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(undefined);
          }
        }}
        title={isRotate ? "Rotate this API key?" : "Revoke this API key?"}
      />
    </>
  );
};
