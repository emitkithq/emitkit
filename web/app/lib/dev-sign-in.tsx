import { authClient } from "@app/lib/auth-client";
import { authMutationKeys, authQueryKeys } from "@better-auth-ui/core";
import { useAuth } from "@better-auth-ui/react";
import type { AuthButtonProps } from "@better-auth-ui/react";
import { Code } from "@gravity-ui/icons";
import { Button, Spinner } from "@heroui/react";
import { useIsMutating, useMutation } from "@tanstack/react-query";

/**
 * "Continue in local dev" under the sign-in form: one click signs in as the
 * local dev user (`POST /api/auth/dev/sign-in`, which only `vite dev` serves).
 */
const DevSignInButton = ({ view }: AuthButtonProps) => {
  const { navigate, redirectTo } = useAuth();
  const { isPending, mutate } = useMutation({
    // Under `["auth", "signIn"]`, so Better Auth UI refetches the session
    // (`meta.awaits`) before `onSuccess` and disables its other sign-in buttons.
    meta: { awaits: [authQueryKeys.session] },
    mutationFn: () =>
      authClient.$fetch("/dev/sign-in", {
        // Better Auth only accepts JSON POST bodies.
        body: {},
        method: "POST",
        throw: true,
      }),
    mutationKey: [...authMutationKeys.signIn.all, "dev"],
    onSuccess: () => navigate({ replace: true, to: redirectTo }),
  });
  const otherSignInPending =
    useIsMutating({ mutationKey: authMutationKeys.signIn.all }) > 0;

  if (view !== "signIn") {
    return null;
  }
  return (
    <Button
      className="w-full"
      isDisabled={otherSignInPending && !isPending}
      isPending={isPending}
      onPress={() => mutate()}
      variant="tertiary"
    >
      {isPending ? <Spinner color="current" size="sm" /> : <Code />}
      Continue in local dev
    </Button>
  );
};

/** A plain factory (no module-level call), so builds drop this module. */
export const devSignInPlugin = () => ({
  authButtons: [DevSignInButton],
  id: "dev-sign-in",
});
