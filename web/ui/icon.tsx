import type { SVGProps } from "react";

/**
 * A small hand-authored stroke icon set, so the dashboard carries no icon
 * dependency. Every glyph is drawn on a 24×24 grid with a 1.6 stroke.
 */
export type IconName =
  | "activity"
  | "app"
  | "archive"
  | "arrow-up"
  | "attach"
  | "bell"
  | "bell-off"
  | "book"
  | "building"
  | "card"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "close"
  | "copy"
  | "dots"
  | "download"
  | "edit"
  | "external"
  | "eye"
  | "eye-off"
  | "filter"
  | "folder"
  | "gear"
  | "hash"
  | "inbox"
  | "key"
  | "library"
  | "lock"
  | "logout"
  | "mail"
  | "monitor"
  | "moon"
  | "note"
  | "panel"
  | "plug"
  | "plus"
  | "procedure"
  | "refresh"
  | "reply"
  | "search"
  | "send"
  | "share"
  | "smartphone"
  | "smile"
  | "sort"
  | "spark"
  | "sun"
  | "trash"
  | "user"
  | "users";

const paths: Record<IconName, string> = {
  activity: "M3 12h4l3 8 4-16 3 8h4",
  app: "M4 5.5h16v13H4zM4 9.5h16M7.5 7h.01M10 7h.01",
  archive: "M3 7h18v3H3zM5 10v9h14v-9M10 14h4",
  "arrow-up": "M12 19V5M6 11l6-6 6 6",
  attach: "M14 6.5 8 12.5a3 3 0 0 0 4.2 4.2l6.3-6.3a5 5 0 0 0-7-7L5 9.8",
  bell: "M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9M10 18a2 2 0 0 0 4 0",
  book: "M5 4.5h9a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H5zM5 4.5v12.5",
  card: "M3.5 6h17v12h-17zM3.5 10h17M7 14.5h4",
  check: "M5 12.5 10 17.5 19 7",
  "chevron-down": "M6 9.5 12 15.5 18 9.5",
  "chevron-left": "M14.5 6 8.5 12l6 6",
  "chevron-right": "M9.5 6 15.5 12l-6 6",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M12 7.5V12l3 2",
  close: "M6 6 18 18M18 6 6 18",
  copy: "M9 9h10v11H9zM5 15V4h10v3",
  dots: "M6 12h.01M12 12h.01M18 12h.01",
  edit: "M4 20h4L19 9l-4-4L4 16zM14.5 5.5 18.5 9.5",
  filter: "M4 6h16l-6 7v6l-4-2v-4z",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 3.5v2M12 18.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4",
  hash: "M5 9.5h14M5 14.5h14M10 4.5 8.5 19.5M15.5 4.5 14 19.5",
  inbox: "M3.5 13h5l1.5 3h4l1.5-3h5M3.5 13 6 5h12l2.5 8v6h-17z",
  library: "M4 5.5h6v13H4zM12 5.5h3v13h-3zM17 6.2l3 12.6",
  lock: "M6 11h12v8H6zM9 11V8a3 3 0 0 1 6 0v3",
  note: "M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 16h4",
  panel: "M3.5 5.5h17v13h-17zM14 5.5v13",
  plug: "M9 3.5v5M15 3.5v5M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0zM12 17v3.5",
  plus: "M12 5.5v13M5.5 12h13",
  procedure: "M7 4.5h10v15H7zM10 8.5h4M10 12h4M10 15.5h2",
  reply: "M9 7 4 12l5 5M4 12h9a6 6 0 0 1 6 6v1",
  search: "M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M15.8 15.8 20 20",
  send: "M4.5 12 20 4.5 15 20l-3.5-6z",
  sort: "M7 4.5v15M7 19.5 4 16.5M7 19.5l3-3M17 19.5v-15M17 4.5l-3 3M17 4.5l3 3",
  spark:
    "M12 3.5 13.8 9.6 20 11.5 13.8 13.4 12 19.5 10.2 13.4 4 11.5 10.2 9.6z",
  sun: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1",
  trash: "M5 7h14M9 7V4.5h6V7M6.5 7l1 12.5h9L17.5 7M10.5 10.5v6M13.5 10.5v6",
  users:
    "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3.2 3.2 0 0 1 0 6.2M17.5 14.4c2.1.7 3.5 2.5 3.5 5.1",
  "bell-off":
    "M8.2 4.8A6 6 0 0 1 18 9c0 4 1.5 5.5 1.5 5.5H9.5M6.2 7.6C6.1 8 6 8.5 6 9c0 4-1.5 5.5-1.5 5.5h3M10 18a2 2 0 0 0 4 0M4 4l16 16",
  building: "M5 20.5v-16h9v16M14 9.5h5v11M3.5 20.5h17M8 8h3M8 11.5h3M8 15h3",
  download: "M12 4.5v11M7.5 11 12 15.5 16.5 11M5 19.5h14",
  external: "M13.5 4.5h6v6M19.5 4.5 11 13M17 13.5v6H4.5V7h6",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5",
  "eye-off":
    "M9.9 5.8A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.2M6.6 7.1A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.5 4.2-1.1M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6M4 4l16 16",
  folder: "M3.5 6.5h6l2 2h9v10h-17z",
  key: "M8 11.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M10.5 12.5 19 4M16 7l2.5 2.5M13.5 9.5 15 11",
  logout: "M14 4.5h5v15h-5M10 8l-4 4 4 4M6 12h9",
  mail: "M3.5 6h17v12h-17zM3.5 6.5l8.5 6 8.5-6",
  monitor: "M3.5 5h17v11h-17zM9 20h6M12 16v4",
  moon: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10",
  refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4",
  share: "M12 3.5v11M8 7.5l4-4 4 4M7 10.5H5v10h14v-10h-2",
  smile:
    "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01",
  smartphone: "M7.5 3.5h9v17h-9zM11 17.5h2",
  user: "M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6",
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export const Icon = ({ name, size = 16, ...props }: IconProps) => (
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.6}
    viewBox="0 0 24 24"
    width={size}
    {...props}
  >
    <path d={paths[name]} />
  </svg>
);
