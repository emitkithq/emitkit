import type { ChannelEmoji } from "@app/features/channels/emoji-data";
import { CHANNEL_EMOJIS, clampEmoji } from "@app/features/channels/emoji-data";
import { errorMessage } from "@app/lib/errors";
import { rpc } from "@app/lib/rpc";
import {
  Autocomplete,
  Button,
  Header,
  ListBox,
  Popover,
  SearchField,
  toast,
  useFilter,
} from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { Icon } from "@ui/icon";
import { useMemo, useState } from "react";

/** The picker's sections, in the curated set's order. */
const groupsOf = (items: readonly ChannelEmoji[]) => {
  const groups = new Map<string, ChannelEmoji[]>();
  for (const item of items) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  return [...groups].map(([name, emojis]) => ({ emojis, name }));
};

/**
 * The curated emoji in a popover: a search field over a grid grouped by
 * theme. Typing filters (by label, keywords and group); arrow keys move
 * through the results; Enter or a click picks one and closes the popover.
 */
const EmojiPicker = ({
  items,
  onChange,
  value,
}: {
  items: readonly ChannelEmoji[];
  onChange: (emoji: string) => void;
  value: string | undefined;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { contains } = useFilter({ sensitivity: "base" });
  const groups = useMemo(() => groupsOf(items), [items]);

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        aria-label={
          value ? `Channel icon ${value}, change` : "Choose channel icon"
        }
        className="border-field-border bg-field hover:border-field-border-hover hover:bg-field size-10 rounded-lg border p-0 text-xl leading-none"
        isIconOnly
        variant="ghost"
      >
        {value ?? <Icon className="text-muted" name="smile" size={18} />}
      </Button>
      <Popover.Content
        className="rounded-[calc(var(--radius)*2)]"
        placement="bottom start"
      >
        <Popover.Dialog
          aria-label="Channel icon"
          className="flex h-[350px] w-[280px] flex-col gap-1.5 p-2"
        >
          <Autocomplete.Filter filter={contains}>
            <SearchField
              aria-label="Search emoji"
              autoFocus
              variant="secondary"
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search emoji…" />
              </SearchField.Group>
            </SearchField>
            <ListBox
              aria-label="Emoji"
              className="-mx-2 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 outline-none"
              layout="grid"
              onSelectionChange={(keys) => {
                // Picking the current emoji again deselects it: keep it, close.
                const [key] = keys === "all" ? [] : [...keys];
                if (key !== undefined) {
                  onChange(String(key));
                }
                setIsOpen(false);
              }}
              renderEmptyState={() => (
                <p className="text-muted text-body p-4 text-center">
                  No emoji found.
                </p>
              )}
              selectedKeys={value ? [value] : []}
              selectionMode="single"
            >
              {groups.map((group) => (
                <ListBox.Section
                  className="grid grid-cols-6 items-stretch not-first:mt-1"
                  key={group.name}
                >
                  <Header className="text-muted col-span-full px-1 pt-1.5 pb-1 text-xs font-medium">
                    {group.name}
                  </Header>
                  {group.emojis.map((item) => (
                    <ListBox.Item
                      className="data-[focused=true]:bg-default data-[selected=true]:bg-default-hover aspect-square min-h-0 justify-center rounded-[var(--radius)] p-0 text-2xl leading-none"
                      id={item.emoji}
                      key={item.emoji}
                      textValue={`${item.label} ${item.keywords} ${item.group}`}
                    >
                      {item.emoji}
                    </ListBox.Item>
                  ))}
                </ListBox.Section>
              ))}
            </ListBox>
          </Autocomplete.Filter>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
};

/**
 * A channel's icon: pick from the curated set or let EmitKit suggest one
 * from the channel name.
 */
export const EmojiField = ({
  channelName,
  onChange,
  value,
}: {
  channelName: string;
  onChange: (emoji?: string) => void;
  value: string | undefined;
}) => {
  const suggest = useMutation({
    mutationFn: (name: string) => rpc.channels.suggestEmoji({ name }),
    onError: (error) =>
      toast.danger(
        errorMessage(error, "No suggestion this time. Pick one yourself.")
      ),
    onSuccess: ({ emoji }) => {
      const icon = clampEmoji(emoji);
      if (icon) {
        onChange(icon);
      } else {
        toast.warning(
          "The suggestion wasn't a single emoji. Pick one yourself."
        );
      }
    },
  });

  // A suggestion can fall outside the curated set; keep it selectable.
  const items = useMemo<readonly ChannelEmoji[]>(
    () =>
      value && !CHANNEL_EMOJIS.some((item) => item.emoji === value)
        ? [
            {
              emoji: value,
              group: "Suggested",
              keywords: "suggested",
              label: "suggested",
            },
            ...CHANNEL_EMOJIS,
          ]
        : CHANNEL_EMOJIS,
    [value]
  );

  const name = channelName.trim();

  return (
    <div>
      <span className="text-muted text-meta block pb-1 font-medium">Icon</span>
      <div className="flex items-center gap-2">
        <EmojiPicker items={items} onChange={onChange} value={value} />
        <Button
          isDisabled={!name}
          isPending={suggest.isPending}
          onPress={() => suggest.mutate(name)}
          size="sm"
          variant="secondary"
        >
          <Icon name="spark" size={14} />
          Suggest
        </Button>
        {value ? (
          <Button onPress={() => onChange()} size="sm" variant="ghost">
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
};
