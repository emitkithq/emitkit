import { apiKey } from "@better-auth/api-key";
import type { TransactionalEmail } from "@server/email/template";
import { devSignIn } from "@server/platform/dev-sign-in";
import type { SignupMethod } from "@server/telemetry/events";
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { emailOTP, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Everything Better Auth needs from the rest of the backend. Keeping this a
 * plain object (instead of Effect services) lets the schema generator in
 * `scripts/generate-auth-schema.ts` build the exact same options in Node.
 */
export interface AuthHooks {
  readonly sendEmail: (message: AuthEmail) => Promise<void>;
  readonly firstOrganizationId: (userId: string) => Promise<string | null>;
  /** A new account; `headers` are the sign-up request's, when there was one. */
  readonly onUserCreated: (
    user: AuthUser,
    method: SignupMethod,
    headers: Headers | null
  ) => Promise<void>;
  readonly onUserDeleted: (user: AuthUser) => Promise<void>;
  readonly onOrganizationCreated: (
    organization: AuthOrganization,
    creator: AuthUser
  ) => Promise<void>;
  /** A user became a member (created the organization or accepted an invite). */
  readonly onMemberJoined: (
    organizationId: string,
    userId: string
  ) => Promise<void>;
  readonly onInvitationAccepted: (
    organization: AuthOrganization,
    user: AuthUser
  ) => Promise<void>;
  readonly onInvitationCreated: (
    organization: AuthOrganization,
    inviter: AuthUser,
    role: string
  ) => Promise<void>;
  readonly onOrganizationDeleted: (
    organization: AuthOrganization,
    deletedBy: AuthUser
  ) => Promise<void>;
  /** Resolves to a reason when the organization can't invite anyone else (seats). */
  readonly beforeInvite: (
    organizationId: string,
    email: string
  ) => Promise<string | null>;
  /** Resolves to a reason when the account can't be deleted yet. */
  readonly beforeUserDeleted: (user: AuthUser) => Promise<string | null>;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface AuthOrganization {
  readonly id: string;
  readonly name: string;
}

/** How an account was created, from the endpoint that created it. */
const SIGNUP_METHODS = new Map<string, SignupMethod>([
  ["/dev/sign-in", "dev"],
  ["/sign-in/email-otp", "email_otp"],
  ["/sign-up/email", "password"],
]);

const authUser = (user: AuthUser): AuthUser => ({
  email: user.email,
  id: user.id,
  name: user.name,
});

const authOrganization = (org: AuthOrganization): AuthOrganization => ({
  id: org.id,
  name: org.name,
});

export type AuthEmail = TransactionalEmail;

export interface AuthSettings {
  readonly appUrl: string;
  readonly siteUrl: string | null;
  readonly allowSignup: boolean;
  /** Enables `POST /api/auth/dev/sign-in` ("Continue in local dev"). */
  readonly devSignIn: boolean;
}

/**
 * Copy for each kind of emailed code. Only sign-in codes are offered in the
 * app; the plugin also serves the other kinds, so they get their own words.
 */
const OTP_EMAILS = {
  "change-email": {
    body: "Enter this code in EmitKit to confirm your new email address. It expires in 5 minutes.",
    heading: "Confirm your email",
    subject: "Your EmitKit confirmation code",
  },
  "email-verification": {
    body: "Enter this code in EmitKit to verify your email address. It expires in 5 minutes.",
    heading: "Verify your email",
    subject: "Your EmitKit verification code",
  },
  "forget-password": {
    body: "Someone asked to reset the password for your EmitKit account. If that was you, enter this code. It expires in 5 minutes.",
    heading: "Reset your password",
    subject: "Your EmitKit password reset code",
  },
  "sign-in": {
    body: "Enter this code in EmitKit to sign in. It expires in 5 minutes. If you didn't ask for it, ignore this email.",
    heading: "Sign in to EmitKit",
    subject: "Your EmitKit sign-in code",
  },
} as const;

/** Public API keys: `emitkit_` followed by 12 random letters. */
export const API_KEY_PREFIX = "emitkit_";
export const API_KEY_RATE_LIMIT = {
  maxRequests: 100,
  timeWindowMs: 60_000,
} as const;

const statements = {
  ...defaultStatements,
  apiKey: ["create", "read", "update", "delete"],
} as const;
const accessControl = createAccessControl(statements);
const roles = {
  admin: accessControl.newRole({
    ...adminAc.statements,
    apiKey: ["create", "read", "update", "delete"],
  }),
  member: accessControl.newRole({ ...memberAc.statements, apiKey: ["read"] }),
  owner: accessControl.newRole({
    ...ownerAc.statements,
    apiKey: ["create", "read", "update", "delete"],
  }),
};

const ID_PREFIXES = new Map<string, string>([
  ["account", "acc"],
  ["apikey", "key"],
  ["invitation", "inv"],
  ["member", "mbr"],
  ["organization", "org"],
  ["rateLimit", "rl"],
  ["session", "sess"],
  ["user", "user"],
  ["verification", "ver"],
]);

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Organization slugs are the dashboard's first path segment; these collide with app routes. */
export const RESERVED_SLUGS = new Set([
  "accept-invitation",
  "api",
  "app",
  "assets",
  "auth",
  "getting-started",
  "rpc",
  "ui",
  "www",
]);

const assertSlugAllowed = (slug: string | undefined) => {
  if (slug && RESERVED_SLUGS.has(slug.toLowerCase())) {
    throw new APIError("BAD_REQUEST", {
      message: `The slug "${slug}" is reserved`,
    });
  }
};

/** Prefixed ids (`user_…`, `org_…`) matching the EmitKit Cloud id format. */
export const generatePrefixedId = (prefix: string): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let body = "";
  for (const byte of bytes) {
    body += ID_ALPHABET[byte % ID_ALPHABET.length];
  }
  return `${prefix}_${body}`;
};

export const authPlugins = (settings: AuthSettings, hooks: AuthHooks) =>
  [
    organization({
      ac: accessControl,
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      invitationExpiresIn: 60 * 60 * 24 * 7,
      roles,
      sendInvitationEmail: async ({
        email,
        organization: org,
        inviter,
        id,
      }) => {
        await hooks.sendEmail({
          actionLabel: "Accept invitation",
          actionUrl: `${settings.appUrl}/accept-invitation/${id}`,
          body: `${inviter.user.name || inviter.user.email} invited you to join ${org.name} on EmitKit.`,
          heading: `Join ${org.name}`,
          subject: `You're invited to ${org.name} on EmitKit`,
          to: email,
        });
      },
      organizationHooks: {
        beforeCreateOrganization: ({ organization: org }) => {
          assertSlugAllowed(org.slug);
          return Promise.resolve();
        },
        beforeUpdateOrganization: ({ organization: org }) => {
          assertSlugAllowed(org.slug);
          return Promise.resolve();
        },
        beforeCreateInvitation: async ({ invitation, organization: org }) => {
          const reason = await hooks.beforeInvite(org.id, invitation.email);
          if (reason) {
            throw new APIError("FORBIDDEN", { message: reason });
          }
        },
        afterCreateInvitation: async ({
          invitation,
          inviter,
          organization: org,
        }) => {
          await hooks.onInvitationCreated(
            authOrganization(org),
            authUser(inviter),
            invitation.role
          );
        },
        afterCreateOrganization: async ({ organization: org, user }) => {
          await hooks.onOrganizationCreated(
            authOrganization(org),
            authUser(user)
          );
          await hooks.onMemberJoined(org.id, user.id);
        },
        afterAcceptInvitation: async ({ organization: org, user }) => {
          await hooks.onMemberJoined(org.id, user.id);
          await hooks.onInvitationAccepted(
            authOrganization(org),
            authUser(user)
          );
        },
        afterDeleteOrganization: async ({ organization: org, user }) => {
          await hooks.onOrganizationDeleted(
            authOrganization(org),
            authUser(user)
          );
        },
      },
    }),
    apiKey({
      defaultKeyLength: 12,
      defaultPrefix: API_KEY_PREFIX,
      enableMetadata: true,
      keyExpiration: { defaultExpiresIn: null },
      rateLimit: {
        enabled: true,
        maxRequests: API_KEY_RATE_LIMIT.maxRequests,
        timeWindow: API_KEY_RATE_LIMIT.timeWindowMs,
      },
      references: "organization",
      requireName: true,
      startingCharactersConfig: {
        charactersLength: API_KEY_PREFIX.length + 4,
        shouldStore: true,
      },
    }),
    // A code rather than a link: a link opens in the browser, which on iPhone
    // keeps its own cookies, so the Home Screen app would stay signed out.
    emailOTP({
      disableSignUp: !settings.allowSignup,
      // Asking again (say, after iOS reloaded the app while you were in Mail)
      // resends the code already on its way instead of voiding it.
      resendStrategy: "reuse",
      sendVerificationOTP: async ({ email, otp, type }) => {
        await hooks.sendEmail({ ...OTP_EMAILS[type], code: otp, to: email });
      },
      storeOTP: "encrypted",
    }),
    devSignIn(settings.devSignIn),
  ] as const;

export const makeAuthOptions = (
  settings: AuthSettings,
  hooks: AuthHooks,
  base: Pick<BetterAuthOptions, "database" | "secret">
) =>
  ({
    ...base,
    advanced: {
      cookiePrefix: "emitkit",
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      database: {
        // D1 migrations own the schema; skip Better Auth's runtime introspection.
        validateSchema: false,
        generateId: ({ model }) =>
          generatePrefixedId(ID_PREFIXES.get(model) ?? model),
      },
      useSecureCookies: settings.appUrl.startsWith("https://"),
    },
    appName: "EmitKit",
    basePath: "/api/auth",
    baseURL: settings.appUrl,
    databaseHooks: {
      user: {
        create: {
          after: async (user, context) => {
            await hooks.onUserCreated(
              authUser(user),
              SIGNUP_METHODS.get(context?.path ?? "") ?? "other",
              context?.headers ?? context?.request?.headers ?? null
            );
          },
        },
        delete: {
          after: async (user) => {
            await hooks.onUserDeleted(authUser(user));
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const activeOrganizationId = await hooks.firstOrganizationId(
              session.userId
            );
            return { data: { ...session, activeOrganizationId } };
          },
        },
      },
    },
    // Password sign-ups get a verification link; verified addresses are what
    // invitations require. Sign-in itself does not wait for verification, and
    // signing in with an emailed code verifies the address on its own.
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await hooks.sendEmail({
          actionLabel: "Verify email",
          actionUrl: url,
          body: "Confirm this is your email address. You need a verified address to accept invitations to organizations.",
          heading: "Verify your email",
          subject: "Verify your EmitKit email",
          to: user.email,
        });
      },
    },
    emailAndPassword: {
      autoSignIn: true,
      disableSignUp: !settings.allowSignup,
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await hooks.sendEmail({
          actionLabel: "Reset password",
          actionUrl: url,
          body: "Someone asked to reset the password for your EmitKit account. If that wasn't you, ignore this email.",
          heading: "Reset your password",
          subject: "Reset your EmitKit password",
          to: user.email,
        });
      },
    },
    plugins: [...authPlugins(settings, hooks)],
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    session: {
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 365,
      updateAge: 60 * 60 * 24,
    },
    telemetry: { enabled: false },
    trustedOrigins: settings.siteUrl
      ? [settings.appUrl, settings.siteUrl]
      : [settings.appUrl],
    user: {
      deleteUser: {
        beforeDelete: async (user) => {
          const reason = await hooks.beforeUserDeleted(authUser(user));
          if (reason) {
            throw new APIError("BAD_REQUEST", { message: reason });
          }
        },
        enabled: true,
      },
    },
  }) satisfies BetterAuthOptions;
