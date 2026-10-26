import { useEffect } from "react";

/**
 * Names the tab: `usePageTitle("Projects", "Acme")` gives
 * "Projects · Acme · EmitKit". Every page calls it once.
 */
export const usePageTitle = (...parts: readonly (string | undefined)[]) => {
  const title = [...parts.filter(Boolean), "EmitKit"].join(" · ");
  useEffect(() => {
    document.title = title;
  }, [title]);
};
