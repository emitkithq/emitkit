import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";

const COPIED_MS = 1600;

/**
 * Copies text to the clipboard and remembers which value was copied for a
 * moment, so buttons can say "Copied".
 */
export const useCopy = () => {
  const [copied, setCopied] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  const copy = useCallback(async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.danger(
        "Couldn't copy to the clipboard. Select the text and copy it manually."
      );
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
    }
    setCopied(id);
    timer.current = setTimeout(() => setCopied(undefined), COPIED_MS);
  }, []);

  return { copied, copy };
};
