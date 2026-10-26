import type { ThemePreference } from "@app/lib/theme";
import { setThemePreference, useThemePreference } from "@app/lib/theme";
import { Icon } from "@ui/icon";
import type { IconName } from "@ui/icon";
import { Segment } from "@ui/segment";

const OPTIONS: readonly {
  icon: IconName;
  id: ThemePreference;
  label: string;
}[] = [
  { icon: "monitor", id: "system", label: "System theme" },
  { icon: "sun", id: "light", label: "Light theme" },
  { icon: "moon", id: "dark", label: "Dark theme" },
];

/** System, light or dark; remembered in this browser. */
export const ThemeSwitcher = () => {
  const preference = useThemePreference();
  return (
    <Segment
      aria-label="Theme"
      items={OPTIONS.map((option) => ({
        "aria-label": option.label,
        content: <Icon name={option.icon} size={14} />,
        id: option.id,
      }))}
      onSelectionChange={setThemePreference}
      selectedKey={preference}
    />
  );
};
