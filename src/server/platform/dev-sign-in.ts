import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/** The account "Continue in local dev" signs in as. */
export const DEV_USER = {
  email: "dev@example.com",
  name: "Local Dev",
};

/**
 * `POST /api/auth/dev/sign-in`: a session for {@link DEV_USER} without
 * credentials, created on first use. The endpoint is always registered (so
 * the inferred `auth.api` type doesn't change) and answers 404 unless
 * `enabled`, which is only true under `vite dev` on a localhost app URL.
 */
export const devSignIn = (enabled: boolean) =>
  ({
    endpoints: {
      devSignIn: createAuthEndpoint(
        "/dev/sign-in",
        { method: "POST" },
        async (ctx) => {
          if (!enabled) {
            throw new APIError("NOT_FOUND");
          }
          const { internalAdapter } = ctx.context;
          const existing = await internalAdapter.findUserByEmail(
            DEV_USER.email
          );
          const user =
            existing?.user ??
            (await internalAdapter.createUser(
              {
                email: DEV_USER.email,
                emailVerified: true,
                name: DEV_USER.name,
              },
              { method: "dev-sign-in" }
            ));
          const session = await internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ user: { email: user.email, id: user.id } });
        }
      ),
    },
    id: "dev-sign-in",
  }) satisfies BetterAuthPlugin;
