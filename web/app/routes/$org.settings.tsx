import type { SettingsSectionId } from "@app/lib/settings-sections";
import { isSettingsSection } from "@app/lib/settings-sections";
import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Settings open as a modal over the feed (`/$org?settings=<section>`). This
 * keeps the old page address working for bookmarks and links in the wild.
 */
export const Route = createFileRoute("/$org/settings")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      params,
      replace: true,
      search: { settings: search.section },
      to: "/$org",
    });
  },
  validateSearch: (
    search: Record<string, unknown>
  ): { section: SettingsSectionId } => ({
    section: isSettingsSection(search.section) ? search.section : "members",
  }),
});
