import { type ComponentType, type ReactNode, use } from "react";

export type Island<P extends object> = ((props: P) => ReactNode) & {
  preload: () => Promise<unknown>;
};

function settle<T>(promise: Promise<T>): Promise<T> {
  const settled: Promise<T> = promise.then((value) => {
    Object.assign(settled, { status: "fulfilled", value });
    return value;
  });
  return settled;
}

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
    const observer = new PerformanceObserver(() => {
      if (!hasContentfulPaint()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe({ type: "paint", buffered: true });
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, FIRST_PAINT_FALLBACK_MS);
  });
  return painted;
}

export function island<P extends object>(load: () => Promise<ComponentType<P>>): Island<P> {
  let pending: Promise<ComponentType<P>> | undefined;
  const component = () => {
    pending ??= settle(rendersEagerly() ? load() : afterFirstContentfulPaint().then(load));
    return pending;
  };

  function Island(props: P): ReactNode {
    const Component = use(component());
    return <Component {...props} />;
  }
  return Object.assign(Island, { preload: component });
}

export function intlIsland<P extends object>(load: () => Promise<ComponentType<P>>): Island<P> {
  return island(() =>
    Promise.all([load(), import("@/components/intl-boundary")]).then(([component, boundary]) =>
      boundary.withIntl(component),
    ),
  );
}

export function rendersEagerly(): boolean {
  return typeof window === "undefined" || process.env.NODE_ENV === "test";
}

export async function preloadOnServer(islands: ReadonlyArray<Island<never>>): Promise<void> {
  if (!rendersEagerly()) return;
  await Promise.all(islands.map((item) => item.preload()));
}
