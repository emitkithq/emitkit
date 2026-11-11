import { ConfirmDialog } from "@app/components/confirm-dialog";
import {
  SettingsCard,
  SettingsNote,
  SettingsSection,
} from "@app/components/settings-primitives";
import { errorMessage } from "@app/lib/errors";
import { dateAndTime } from "@app/lib/format";
import { orpc, rpc } from "@app/lib/rpc";
import { Button, Spinner, toast } from "@heroui/react";
import type { OAuthConnection } from "@shared/rpc/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ui/badge";
import { EmptyState } from "@ui/empty-state";
import { useState } from "react";

const ConnectionRow = ({
  connection,
  onRevoke,
}: {
  connection: OAuthConnection;
  onRevoke: () => void;
}) => (
  <li className="border-separator flex flex-wrap items-center gap-3 border-b px-4 py-3.5 last:border-b-0">
    <span
      aria-hidden="true"
      className="bg-default-soft text-foreground grid size-8 shrink-0 place-items-center rounded-lg text-[13px] font-semibold"
    >
      {connection.clientName.charAt(0).toUpperCase()}
    </span>
    <div className="min-w-[12rem] flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body text-foreground truncate">
          {connection.clientName}
        </h3>
        {connection.projectName ? null : (
          <Badge tone="danger">Project deleted</Badge>
        )}
      </div>
      <p className="text-meta text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {connection.projectName ? (
          <span>
            {connection.projectName}
            {connection.organizationName
              ? ` · ${connection.organizationName}`
              : ""}
          </span>
        ) : null}
        {connection.redirectHosts.length > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{connection.redirectHosts.join(", ")}</span>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <span>Connected {dateAndTime(connection.connectedAt)}</span>
      </p>
    </div>
    <Button
      aria-label={`Revoke ${connection.clientName}`}
      onPress={onRevoke}
      size="sm"
      variant="danger-soft"
    >
      Revoke
    </Button>
  </li>
);

/**
 * Apps you connected over OAuth (ChatGPT, Claude, MCP clients), across your
 * organizations. Revoking stops them at once: the next request is refused,
 * refresh tokens stop working and their event subscriptions end.
 */
export const ConnectedAppsSection = () => {
  const queryClient = useQueryClient();
  const connections = useQuery(orpc.oauth.connections.queryOptions());
  const [revoking, setRevoking] = useState<OAuthConnection>();
  const revoke = useMutation({
    mutationFn: (connection: OAuthConnection) =>
      rpc.oauth.revoke({ id: connection.id }),
    onError: (error) =>
      toast.danger(errorMessage(error, "Access couldn't be revoked.")),
    onSuccess: async (_result, connection) => {
      setRevoking(undefined);
      toast.success(`Revoked ${connection.clientName}`);
      await queryClient.invalidateQueries({
        queryKey: orpc.oauth.connections.key(),
      });
    },
  });

  const renderList = () => {
    if (connections.isPending) {
      return (
        <div className="grid place-items-center py-8">
          <Spinner aria-label="Loading connected apps" size="sm" />
        </div>
      );
    }
    if (connections.isError) {
      return (
        <SettingsNote tone="danger">
          {errorMessage(
            connections.error,
            "Connected apps couldn't be loaded."
          )}
        </SettingsNote>
      );
    }
    if (connections.data.length === 0) {
      return (
        <EmptyState
          description="Connect ChatGPT, Claude or another MCP client to a project, and it shows up here."
          icon="plug"
          title="No connected apps"
          variant="block"
        />
      );
    }
    return (
      <ul aria-label="Connected apps">
        {connections.data.map((connection) => (
          <ConnectionRow
            connection={connection}
            key={connection.id}
            onRevoke={() => setRevoking(connection)}
          />
        ))}
      </ul>
    );
  };

  return (
    <SettingsSection
      description="Apps you allowed to use EmitKit on your behalf, each on one project. Revoking takes effect at once."
      title="Connected apps"
    >
      <SettingsCard>{renderList()}</SettingsCard>
      <ConfirmDialog
        confirmLabel="Revoke access"
        description={`${revoking?.clientName ?? "The app"} stops working with EmitKit straight away, and its event subscriptions end. Connect it again to restore access.`}
        isOpen={revoking !== undefined}
        isPending={revoke.isPending}
        onConfirm={() => {
          if (revoking) {
            revoke.mutate(revoking);
          }
        }}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRevoking(undefined);
          }
        }}
        title={`Revoke ${revoking?.clientName ?? "this app"}?`}
      />
    </SettingsSection>
  );
};
