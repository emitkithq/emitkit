import "@orpc/experimental-effect/extensions/input-output";
import { oc } from "@orpc/contract";
import {
  AnswerCard,
  AnswerInput,
  ApiKey,
  ApiKeyInput,
  BillingStatus,
  BillingStatusQuery,
  BootstrapInput,
  BrandLookupInput,
  BootstrapResult,
  ByEndpoint,
  ByEvent,
  ById,
  ByProject,
  Channel,
  ChannelInput,
  ChannelUpdate,
  CheckoutInput,
  CheckoutResult,
  CreatedApiKey,
  EmojiInput,
  EmojiResult,
  EventPage,
  EventQuery,
  GettingStarted,
  OrganizationBrand,
  Project,
  ProjectInput,
  PortalResult,
  ProjectUpdate,
  Pulse,
  PulseQuery,
  PushDeviceInput,
  PushDeviceSync,
  PushDeviceSyncInput,
  PushOrganizationInput,
  PushPreferences,
  PushSettings,
  PushSubscriptionInput,
  RevealedApiKey,
  SeatsInput,
  SeatsPreview,
  TestEventResult,
  TestPushResult,
  Workspace,
  WorkspaceRef,
} from "@shared/rpc/schemas";
import { Schema } from "effect";

const Ok = Schema.Struct({ ok: Schema.Boolean });
const ProjectListInput = Schema.Struct({
  includeDeleted: Schema.optional(Schema.Boolean),
});
const PublicKey = Schema.Struct({ publicKey: Schema.String });

/**
 * Dashboard RPC contract, served at `/rpc` on the app host. Every procedure
 * runs against the caller's active organization; none accepts an
 * organization id from the client.
 */
export const contract = {
  /**
   * The answer page (`/a/{eventId}`). The event may belong to any
   * organization the caller is a member of, not just the active one.
   */
  answers: {
    get: oc.input(ByEvent).output(AnswerCard),
    submit: oc.input(AnswerInput).output(AnswerCard),
  },
  apiKeys: {
    create: oc.input(ApiKeyInput).output(CreatedApiKey),
    list: oc.output(Schema.Array(ApiKey)),
    reveal: oc.input(ById).output(RevealedApiKey),
    revoke: oc.input(ById).output(Ok),
    rotate: oc.input(ById).output(CreatedApiKey),
  },
  billing: {
    checkout: oc.input(CheckoutInput).output(CheckoutResult),
    portal: oc.output(PortalResult),
    previewSeats: oc.input(SeatsInput).output(SeatsPreview),
    setSeats: oc.input(SeatsInput).output(BillingStatus),
    status: oc.input(BillingStatusQuery).output(BillingStatus),
  },
  channels: {
    create: oc.input(ChannelInput).output(Channel),
    list: oc.input(ByProject).output(Schema.Array(Channel)),
    remove: oc.input(ById).output(Ok),
    suggestEmoji: oc.input(EmojiInput).output(EmojiResult),
    update: oc.input(ChannelUpdate).output(Channel),
  },
  events: {
    list: oc.input(EventQuery).output(EventPage),
    pulse: oc.input(PulseQuery).output(Pulse),
    remove: oc.input(ById).output(Ok),
  },
  gettingStarted: {
    bootstrap: oc.input(BootstrapInput).output(BootstrapResult),
    ensureWorkspace: oc.output(WorkspaceRef),
    sendTestEvent: oc.output(TestEventResult),
    status: oc.output(GettingStarted),
  },
  notifications: {
    disableEverywhere: oc.input(ByEndpoint).output(Ok),
    enableEverywhere: oc.input(PushDeviceInput).output(PushPreferences),
    get: oc.input(ByEndpoint).output(PushSettings),
    preferences: oc.input(ByEndpoint).output(PushPreferences),
    setOrganization: oc.input(PushOrganizationInput).output(PushPreferences),
    publicKey: oc.output(PublicKey),
    subscribe: oc.input(PushSubscriptionInput).output(PushSettings),
    syncDevice: oc.input(PushDeviceSyncInput).output(PushDeviceSync),
    test: oc.output(TestPushResult),
    unsubscribe: oc.input(ByEndpoint).output(Ok),
  },
  projects: {
    /** The project's callback signing secret, `whsec_…` (owners and admins). */
    callbackSecret: oc.input(ById).output(RevealedApiKey),
    create: oc.input(ProjectInput).output(Project),
    list: oc.input(ProjectListInput).output(Schema.Array(Project)),
    remove: oc.input(ById).output(Ok),
    restore: oc.input(ById).output(Project),
    update: oc.input(ProjectUpdate).output(Project),
  },
  workspace: {
    /** The organization's brand; the first read looks it up (owners and admins). */
    brand: oc.output(OrganizationBrand),
    current: oc.output(Workspace),
    lookupBrand: oc.input(BrandLookupInput).output(OrganizationBrand),
  },
};

export type DashboardContract = typeof contract;
