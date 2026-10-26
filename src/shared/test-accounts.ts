/**
 * Accounts that aren't real users: local dev sign-in, and the E2E runs'
 * addresses (`e2e/support/targets.ts`), which would otherwise be reported on
 * every production run. Operator telemetry skips them on both sides.
 */
const TEST_ACCOUNT =
  /^dev@example\.com$|^e2e\+.*@example\.com$|\+emitkit-e2e-/iu;

export const isTestAccount = (email: string): boolean =>
  TEST_ACCOUNT.test(email);
