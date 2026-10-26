import { Schema } from "effect";

/**
 * What a credential (an API key, later an OAuth token) may do with the
 * public API and MCP. A key without scopes has all of them, so keys issued
 * before scopes existed keep working.
 */
export const Scope = Schema.Literals([
  "events:write",
  "events:read",
  "identities:write",
]);
export type Scope = typeof Scope.Type;

export const ALL_SCOPES: readonly Scope[] = Scope.literals;

/** A read-only key: reads events and channels, sends nothing. */
export const READ_ONLY: readonly Scope[] = ["events:read"];

/** How much a key may do, as the dashboard offers it. */
export const KeyAccess = Schema.Literals(["full", "read"]);
export type KeyAccess = typeof KeyAccess.Type;

export const scopesOf = (access: KeyAccess): readonly Scope[] =>
  access === "read" ? READ_ONLY : ALL_SCOPES;

const isScope = Schema.is(Scope);

/**
 * A key's scopes from its stored metadata: all of them when it has none
 * (keys from before scopes), only the known ones when it lists some, and
 * none when the value isn't a list. Unreadable never widens a key.
 */
export const scopesFrom = (value: unknown): readonly Scope[] => {
  if (value === undefined) {
    return ALL_SCOPES;
  }
  return Array.isArray(value) ? value.filter(isScope) : [];
};

/** The dashboard's name for a key's scopes: full, or read (anything less). */
export const accessOf = (scopes: readonly Scope[]): KeyAccess =>
  ALL_SCOPES.every((scope) => scopes.includes(scope)) ? "full" : "read";
