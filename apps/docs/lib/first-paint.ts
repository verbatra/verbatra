const FIRST_PAINT_FALLBACK_MS = 3000;

let painted: Promise<void> | undefined;

function hasContentfulPaint(): boolean {
  return performance.getEntriesByName("first-contentful-paint").length > 0;
}

export function afterFirstContentfulPaint(): Promise<void> {
  painted ??= new Promise<void>((resolve) => {
    if (
      typeof PerformanceObserver === "undefined" ||
      !PerformanceObserver.supportedEntryTypes?.includes("paint") ||
      hasContentfulPaint()
    ) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(fallback);
      observer.disconnect();
      resolve();
    };
    const observer = new PerformanceObserver(() => {
      if (hasContentfulPaint()) finish();
    });
    const fallback = setTimeout(finish, FIRST_PAINT_FALLBACK_MS);
    observer.observe({ type: "paint", buffered: true });
  });
  return painted;
}
