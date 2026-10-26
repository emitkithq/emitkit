import { TextInput } from "@app/components/fields";
import {
  SettingsCard,
  SettingsSection,
} from "@app/components/settings-primitives";
import { authClient, unwrap } from "@app/lib/auth-client";
import { errorMessage } from "@app/lib/errors";
import type { Viewer } from "@app/lib/session";
import { authQueryKeys } from "@better-auth-ui/core";
import { SecuritySettings } from "@better-auth-ui/heroui";
import { useSession } from "@better-auth-ui/react";
import { Button, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const ProfileCard = ({ viewer }: { viewer: Viewer }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(viewer.name);

  const save = useMutation({
    mutationFn: () => unwrap(authClient.updateUser({ name: name.trim() })),
    onError: (error) =>
      toast.danger(errorMessage(error, "Your profile couldn't be saved.")),
    onSuccess: async () => {
      toast.success("Profile saved");
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.session });
    },
  });

  return (
    <SettingsSection title="Profile">
      <SettingsCard>
        <form
          className="flex flex-col gap-4 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && name.trim() !== viewer.name) {
              save.mutate();
            }
          }}
        >
          <TextInput
            autoComplete="name"
            label="Name"
            maxLength={255}
            onValueChange={setName}
            required
            value={name}
          />
          <TextInput
            description="Your sign-in address."
            disabled
            label="Email"
            readOnly
            type="email"
            value={viewer.email}
          />
          <div className="flex justify-end">
            <Button
              isDisabled={!name.trim() || name.trim() === viewer.name}
              isPending={save.isPending}
              size="sm"
              type="submit"
            >
              Save profile
            </Button>
          </div>
        </form>
      </SettingsCard>
    </SettingsSection>
  );
};

/**
 * Your own account: profile (v2 style), then Better Auth UI's security
 * settings — password, active sessions, and account deletion.
 */
export const AccountSection = ({ viewer }: { viewer: Viewer }) => {
  const { data: session } = useSession(authClient);
  const current = session?.user ?? viewer;
  return (
    <>
      <ProfileCard key={`${current.id}:${current.name}`} viewer={current} />
      <SecuritySettings />
    </>
  );
};
