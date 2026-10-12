import { Activity, type ComponentType, type ReactNode, use, useEffect, useState } from "react";
import { RETRY_DELAYS_MS, retrying } from "@/lib/retry";
import { useHydrated } from "@/lib/use-hydrated";

export type Island<P extends object> = ((props: P) => ReactNode) & {
  preload: () => Promise<unknown>;
};

export type IslandGate = () => Promise<void>;

export interface IslandOptions {
  gate?: IslandGate;
  retryDelaysMs?: ReadonlyArray<number>;
  mountTimeoutMs?: number;
}

const ISLAND_FAILED = Symbol("island-failed");

type Loaded<P> = ComponentType<P> | typeof ISLAND_FAILED;

function failed(): typeof ISLAND_FAILED {
  return ISLAND_FAILED;
}

function within<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function isFulfilled(promise: Promise<unknown>): boolean {
  return (promise as { status?: string }).status === "fulfilled";
}

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

export function rendersEagerly(): boolean {
  return typeof window === "undefined";
}

const CLIENT_MOUNT_TIMEOUT_MS = 8000;
const ISLAND_CLASS = "vk-island";
const KEEP_SERVER_MARKUP = { __html: "" };

export function island<P extends object>(
  load: () => Promise<ComponentType<P>>,
  {
    gate = afterFirstContentfulPaint,
    retryDelaysMs = RETRY_DELAYS_MS,
    mountTimeoutMs = CLIENT_MOUNT_TIMEOUT_MS,
  }: IslandOptions = {},
): Island<P> {
  let pending: Promise<Loaded<P>> | undefined;
  let mounting: Promise<Loaded<P>> | undefined;
  const component = () => {
    pending ??= settle(
      rendersEagerly() ? load() : gate().then(() => retrying(load, retryDelaysMs).catch(failed)),
    );
    return pending;
  };
  const mountedComponent = () => {
    const current = component();
    if (isFulfilled(current)) return current;
    mounting ??= settle(within(current, mountTimeoutMs, ISLAND_FAILED));
    return mounting;
  };
  const gaveUp = (promise: Promise<Loaded<P>> | undefined) =>
    (promise as { value?: unknown } | undefined)?.value === ISLAND_FAILED;
  const forgetFailure = () => {
    if (gaveUp(pending)) pending = undefined;
    if (gaveUp(mounting) || pending === undefined) mounting = undefined;
  };

  function Hydrated(props: P): ReactNode {
    const hydrated = useHydrated();
    const [fromServer] = useState(!hydrated);
    const Component = use(fromServer ? component() : mountedComponent());
    if (Component !== ISLAND_FAILED) {
      return (
        <span className={ISLAND_CLASS}>
          <Component {...props} />
        </span>
      );
    }
    if (!fromServer) return null;
    return (
      <span
        className={ISLAND_CLASS}
        dangerouslySetInnerHTML={KEEP_SERVER_MARKUP}
        suppressHydrationWarning
      />
    );
  }

  function Island(props: P): ReactNode {
    useEffect(() => forgetFailure, []);
    return (
      <Activity mode="visible">
        <Hydrated {...props} />
      </Activity>
    );
  }
  return Object.assign(Island, { preload: component });
}

export function intlIsland<P extends object>(
  load: () => Promise<ComponentType<P>>,
  options?: IslandOptions,
): Island<P> {
  return island(
    () =>
      Promise.all([load(), import("@/components/intl-boundary")]).then(([component, boundary]) =>
        boundary.withIntl(component),
      ),
    options,
  );
}

export async function preloadIslands(islands: ReadonlyArray<Island<never>>): Promise<void> {
  const loads = islands.map((item) => item.preload());
  if (rendersEagerly()) await Promise.all(loads);
}
