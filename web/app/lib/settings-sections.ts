import type { IconName } from "@ui/icon";

export const settingsSections = [
  "api-keys",
  "billing",
  "members",
  "notifications",
  "organization",
  "account",
] as const;

export type SettingsSectionId = (typeof settingsSections)[number];

export const isSettingsSection = (value: unknown): value is SettingsSectionId =>
  typeof value === "string" &&
  (settingsSections as readonly string[]).includes(value);

export interface SettingsSectionItem {
  icon: IconName;
  label: string;
  value: SettingsSectionId;
}

export const settingsSectionGroups: readonly {
  items: readonly SettingsSectionItem[];
  label: string;
}[] = [
  {
    items: [
      { icon: "users", label: "Members", value: "members" },
      { icon: "building", label: "Organization", value: "organization" },
      { icon: "card", label: "Billing", value: "billing" },
    ],
    label: "Organization",
  },
  {
    items: [{ icon: "key", label: "API keys", value: "api-keys" }],
    label: "Developers",
  },
  {
    items: [
      { icon: "bell", label: "Notifications", value: "notifications" },
      { icon: "user", label: "Account", value: "account" },
    ],
    label: "You",
  },
];

export const settingsSectionItem = (
  section: SettingsSectionId
): SettingsSectionItem =>
  settingsSectionGroups
    .flatMap((group) => group.items)
    .find((item) => item.value === section) as SettingsSectionItem;
