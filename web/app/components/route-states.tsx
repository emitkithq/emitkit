import { errorMessage } from "@app/lib/errors";
import { usePageTitle } from "@app/lib/page-title";
import { Button, Spinner } from "@heroui/react";
import { useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { EmptyState } from "@ui/empty-state";
import { useCallback } from "react";

/** Shown while a route's guards run (session, organization, workspace). */
export const RoutePending = () => (
  <output className="grid min-h-40 flex-1 place-items-center py-16">
    <Spinner aria-label="Loading" size="sm" />
  </output>
);

export const RouteError = ({ error, reset }: ErrorComponentProps) => {
  const router = useRouter();
  usePageTitle("Something went wrong");
  const retry = useCallback(async () => {
    reset();
    await router.invalidate();
  }, [reset, router]);

  return (
    <div className="flex min-h-[60svh] flex-1 flex-col px-6 py-10">
      <EmptyState
        action={
          <Button onPress={retry} size="sm" variant="secondary">
            Try again
          </Button>
        }
        description={errorMessage(
          error,
          "EmitKit couldn't load this page. Check your connection and try again."
        )}
        icon="close"
        title="Something went wrong"
      />
    </div>
  );
};

export const RouteNotFound = () => {
  usePageTitle("Page not found");
  return (
    <div className="flex min-h-[60svh] flex-1 flex-col px-6 py-10">
      <EmptyState
        action={
          <a
            className="text-accent-soft-foreground text-body no-underline hover:underline"
            href="/"
          >
            Go to your dashboard
          </a>
        }
        description="This page doesn't exist, or you don't have access to it."
        icon="search"
        title="Page not found"
      />
    </div>
  );
};
