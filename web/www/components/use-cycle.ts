import { useEffect, useRef, useState } from "react";

/**
 * A counter that ticks every `everyMs` while the referenced element is on
 * screen. It starts at 0 (the prerendered, still state), only moves after
 * hydration, and never moves for readers who ask for reduced motion.
 */
export const useCycle = <T extends Element>(everyMs: number) => {
  const [tick, setTick] = useState(0);
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (entry?.isIntersecting) {
        timer = setInterval(() => setTick((value) => value + 1), everyMs);
      }
    });
    observer.observe(element);
    return () => {
      clearInterval(timer);
      observer.disconnect();
    };
  }, [everyMs]);
  return { ref, tick };
};
