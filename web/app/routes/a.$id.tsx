import { AnswerPage } from "@app/features/answers/answer-page";
import { requireSession } from "@app/lib/session";
import { createFileRoute } from "@tanstack/react-router";
import { Wordmark } from "@ui/brand-mark";

/** No bottom padding: the answer buttons sit in a bar pinned to the bottom. */
const AnswerRoute = () => {
  const { id } = Route.useParams();
  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <a
          aria-label="EmitKit home"
          className="mb-8 flex w-fit items-center no-underline"
          href="/"
        >
          <Wordmark className="h-7 w-auto" tone="auto" />
        </a>
        <AnswerPage eventId={id} key={id} />
      </div>
    </main>
  );
};

export const Route = createFileRoute("/a/$id")({
  async beforeLoad({ context: { queryClient }, location }) {
    await requireSession(queryClient, location.href);
  },
  component: AnswerRoute,
});
