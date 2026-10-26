import type { Session } from "@app/lib/session";
import { authQueryKeys } from "@better-auth-ui/core";
import { hashKey } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { forgetVisitor, identifyVisitor } from "@ui/visits";

const SESSION = hashKey(authQueryKeys.session);

/**
 * Names the signed-in user for operator telemetry (`@ui/visits`) whenever the
 * session query settles: a restored session, sign-in and sign-up alike. A
 * session that turns out empty forgets them; so do sign-out and account
 * deletion (`auth-client.ts`), which the cache may never see.
 */
export const watchVisitor = (queryClient: QueryClient): void => {
  queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type !== "updated" ||
      event.action.type !== "success" ||
      event.query.queryHash !== SESSION
    ) {
      return;
    }
    const session = event.query.state.data as Session | null | undefined;
    if (session?.user) {
      identifyVisitor(session.user);
    } else {
      forgetVisitor();
    }
  });
};
