import { Button, Dropdown, Label, Separator } from "@heroui/react";
import { Icon } from "@ui/icon";
import type { IconName } from "@ui/icon";

export interface RowAction {
  icon: IconName;
  id: string;
  label: string;
}

/**
 * The "…" menu at the end of a list row: the row's secondary actions, and a
 * destructive one last, set apart. One pattern for every managed list.
 */
export const RowActions = ({
  actions,
  danger,
  label,
  onAction,
}: {
  actions: readonly RowAction[];
  danger?: RowAction | undefined;
  /** Names the row, e.g. "Cal.com": the button reads "Actions for Cal.com". */
  label: string;
  onAction: (id: string) => void;
}) => (
  <Dropdown>
    <Button
      aria-label={`Actions for ${label}`}
      isIconOnly
      size="sm"
      variant="ghost"
    >
      <Icon name="dots" size={16} />
    </Button>
    <Dropdown.Popover className="min-w-[200px]" placement="bottom end">
      <Dropdown.Menu onAction={(key) => onAction(String(key))}>
        {actions.map((action) => (
          <Dropdown.Item
            id={action.id}
            key={action.id}
            textValue={action.label}
          >
            <Icon
              className="text-muted shrink-0"
              name={action.icon}
              size={15}
            />
            <Label>{action.label}</Label>
          </Dropdown.Item>
        ))}
        {danger ? (
          <>
            <Separator />
            <Dropdown.Item
              id={danger.id}
              textValue={danger.label}
              variant="danger"
            >
              <Icon
                className="text-danger shrink-0"
                name={danger.icon}
                size={15}
              />
              <Label>{danger.label}</Label>
            </Dropdown.Item>
          </>
        ) : null}
      </Dropdown.Menu>
    </Dropdown.Popover>
  </Dropdown>
);
