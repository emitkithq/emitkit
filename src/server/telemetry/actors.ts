import type { OrganizationOwner } from "@server/organizations/memberships";
import type { TelemetryActor } from "@server/platform/telemetry";

/** Organization-level events (billing, milestones) are about its owner. */
export const ownerActor = (
  owner: OrganizationOwner | null
): TelemetryActor | null =>
  owner?.userId && owner.email
    ? { email: owner.email, userId: owner.userId }
    : null;
