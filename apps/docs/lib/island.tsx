import {
  Activity,
  type ComponentType,
  type ReactNode,
  use,
  useEffect,
  useSyncExternalStore,
} from "react";

export type Island<P extends object> = ((props: P) => ReactNode) & {
  preload: () => Promise<unknown>;
};

export type IslandGate = () => Promise<void>;

export interface IslandOptions {
  gate?: IslandGate;
  retryDelaysMs?: ReadonlyArray<number>;
}

const ISLAND_FAILED = Symbol("island-failed");

type Loaded<P> = ComponentType<P> | typeof ISLAND_FAILED;

export const ISLAND_RETRY_DELAYS_MS: ReadonlyArray<number> = [500, 2000];

function settle<T>(promise: Promise<T>): Promise<T> {
  const settled: Promise<T> = promise.then((value) => {
    Object.assign(settled, { status: "fulfilled", value });
    return value;
  });
  return settled;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadWithRetry<P>(
  load: () => Promise<ComponentType<P>>,
  delays: ReadonlyArray<number>,
): Promise<Loaded<P>> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await load();
    } catch {
      const delay = delays[attempt];
      if (delay === undefined) return ISLAND_FAILED;
      await wait(delay);
    }
  }
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

const neverSettles = new Promise<never>(() => undefined);

function subscribeToNothing(): () => void {
  return () => undefined;
}

function useHydrating(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => false,
    () => true,
  );
}

export function island<P extends object>(
  load: () => Promise<ComponentType<P>>,
  { gate = afterFirstContentfulPaint, retryDelaysMs = ISLAND_RETRY_DELAYS_MS }: IslandOptions = {},
): Island<P> {
  let pending: Promise<Loaded<P>> | undefined;
  const component = () => {
    pending ??= settle(
      rendersEagerly() ? load() : gate().then(() => loadWithRetry(load, retryDelaysMs)),
    );
    return pending;
  };
  const forgetFailure = () => {
    if ((pending as { value?: unknown } | undefined)?.value === ISLAND_FAILED) pending = undefined;
  };

  function Hydrated(props: P): ReactNode {
    const hydrating = useHydrating();
    const Component = use(component());
    if (Component !== ISLAND_FAILED) return <Component {...props} />;
    if (hydrating) use(neverSettles);
    return null;
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
