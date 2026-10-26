import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The old first-run page. New users now land in their dashboard, where the
 * setup guide opens; this address stays for links and bookmarks.
 */
export const Route = createFileRoute("/getting-started")({
  beforeLoad() {
    throw redirect({ replace: true, to: "/" });
  },
});
