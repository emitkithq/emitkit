import { devSignInPlugin } from "@app/lib/dev-sign-in";
import { viewPaths } from "@better-auth-ui/core";
import { deleteUserPlugin } from "@better-auth-ui/heroui/plugins/delete-user";
import { emailOtpPlugin } from "@better-auth-ui/heroui/plugins/email-otp";
import { organizationPlugin } from "@better-auth-ui/heroui/plugins/organization";

/**
 * Better Auth UI plugins matching the server: emailed sign-in codes, organizations
 * (logo upload disabled — there is no upload handler), and account deletion.
 * Under `vite dev`, "Continue in local dev" joins the sign-in form.
 */
export const authUiPlugins = [
  emailOtpPlugin(),
  organizationPlugin({ logo: { enabled: false } }),
  deleteUserPlugin(),
  ...(import.meta.env.DEV ? [devSignInPlugin()] : []),
];

/**
 * Where Better Auth UI's own links point. `/auth` is real; the other two are
 * translated into dashboard routes by the provider's `navigate` adapter.
 */
export const authUiBasePaths = {
  auth: "/auth",
  organization: "/organization",
  settings: "/account",
} as const;

/** Every `/auth/<path>` segment a registered view can render. */
export const authPathSegments: ReadonlySet<string> = new Set([
  ...Object.values(viewPaths.auth),
  ...authUiPlugins.flatMap((plugin) =>
    "viewPaths" in plugin && plugin.viewPaths
      ? Object.values(plugin.viewPaths.auth ?? {})
      : []
  ),
]);
