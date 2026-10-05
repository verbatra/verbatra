import { useEffect, useState } from "react";

export const NOW_TICK_MS = 1_000;

export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) {
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(timer);
  }, [ticking]);

  return now;
}
