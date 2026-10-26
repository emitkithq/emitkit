/**
 * The feed's filters. They live in the URL so a filtered feed is a view
 * someone can link a colleague to.
 *
 * Note: Every key is optional (not `string | undefined`): TanStack Router
 * reads a required key as a required search param, which would force every
 * link to `/$org` to spell the filters out.
 */
export interface EventFilters {
  channelId?: string;
  projectId?: string;
  search?: string;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

export const parseEventFilters = (
  search: Record<string, unknown>
): EventFilters => {
  const filters: EventFilters = {};
  const channelId = optionalString(search.channelId);
  const projectId = optionalString(search.projectId);
  const text = optionalString(search.search);
  if (channelId) {
    filters.channelId = channelId;
  }
  if (projectId) {
    filters.projectId = projectId;
  }
  if (text) {
    filters.search = text;
  }
  return filters;
};
