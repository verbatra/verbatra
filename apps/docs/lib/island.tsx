import { Activity, type ComponentType, type ReactNode, use, useEffect, useState } from "react";
import { afterFirstContentfulPaint } from "@/lib/first-paint";
import { RETRY_DELAYS_MS, retrying } from "@/lib/retry";
import { sameValue } from "@/lib/same-value";
import { useHydrated } from "@/lib/use-hydrated";
import { within } from "@/lib/within";

type Island<P extends object> = ((props: P) => ReactNode) & {
  preload: () => Promise<unknown>;
  pendingTakeovers: () => number;
};

type IslandGate = () => Promise<void>;

export interface IslandOptions {
  gate?: IslandGate;
  retryDelaysMs?: ReadonlyArray<number>;
  reloadDelaysMs?: ReadonlyArray<number>;
  timeoutMs?: number;
  as?: "span" | "div";
}

const ISLAND_FAILED = Symbol("island-failed");

type Loaded<P> = ComponentType<P> | typeof ISLAND_FAILED;

type Takeover<P> = (component: ComponentType<P>) => void;

type LoaderOptions = Required<Omit<IslandOptions, "as">>;

function failed(): typeof ISLAND_FAILED {
  return ISLAND_FAILED;
}

function fulfilled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled", value });
}

function settle<T>(promise: Promise<T>): Promise<T> {
  const settled: Promise<T> = promise.then((value) => {
    Object.assign(settled, { status: "fulfilled", value });
    return value;
  });
  return settled;
}

function rendersOnServer(): boolean {
  return typeof window === "undefined";
}

function islandLoader<P>(
  load: () => Promise<ComponentType<P>>,
  { gate, retryDelaysMs, reloadDelaysMs, timeoutMs }: LoaderOptions,
) {
  const takeovers = new Set<Takeover<P>>();
  const failedNow = fulfilled<Loaded<P>>(ISLAND_FAILED);
  let loadedNow: Promise<Loaded<P>> | undefined;
  let loading: Promise<Loaded<P>> | undefined;
  let inFlight = false;
  let loadingSince = 0;
  let attempt: Promise<Loaded<P>> | undefined;
  let degraded = false;
  let failures = 0;
  let nextReloadAt = 0;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  const clearReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = undefined;
  };
  const succeed = (component: ComponentType<P>) => {
    loadedNow = fulfilled<Loaded<P>>(component);
    clearReload();
    for (const takeover of takeovers) takeover(component);
    takeovers.clear();
  };
  const fail = () => {
    degraded = true;
    failures += 1;
    const delay = reloadDelaysMs[Math.min(failures, reloadDelaysMs.length) - 1] ?? 0;
    nextReloadAt = Date.now() + delay;
    if (takeovers.size > 0) scheduleReload();
  };
  const start = (): Promise<Loaded<P>> => {
    if (loading !== undefined && (inFlight || loadedNow !== undefined)) return loading;
    inFlight = true;
    loadingSince = Date.now();
    const current = settle(
      rendersOnServer() ? load() : gate().then(() => retrying(load, retryDelaysMs).catch(failed)),
    );
    loading = current;
    current.then(
      (result) => {
        inFlight = false;
        if (result === ISLAND_FAILED) fail();
        else succeed(result);
      },
      () => {
        inFlight = false;
      },
    );
    return current;
  };
  const scheduleReload = () => {
    if (inFlight || reloadTimer !== undefined || loadedNow !== undefined) return;
    const delay = nextReloadAt - Date.now();
    if (delay <= 0) {
      void start();
      return;
    }
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      if (takeovers.size > 0) void start();
    }, delay);
  };

  return {
    preload: (): Promise<unknown> => (degraded && loading !== undefined ? loading : start()),
    attempt: (): Promise<Loaded<P>> => {
      if (loadedNow !== undefined) return loadedNow;
      if (degraded) return failedNow;
      if (rendersOnServer()) return start();
      if (attempt !== undefined) return attempt;
      const loaded = start();
      const bounded = settle(within(loaded, loadingSince + timeoutMs - Date.now(), ISLAND_FAILED));
      void bounded.then((result) => {
        if (result === ISLAND_FAILED) degraded = true;
      });
      attempt = bounded;
      return bounded;
    },
    awaitTakeover: (takeover: Takeover<P>): (() => void) => {
      takeovers.add(takeover);
      scheduleReload();
      return () => {
        takeovers.delete(takeover);
        if (takeovers.size === 0) clearReload();
      };
    },
    pendingTakeovers: (): number => takeovers.size,
  };
}

const ISLAND_TIMEOUT_MS = 8000;
const ISLAND_RELOAD_DELAYS_MS: ReadonlyArray<number> = [0, 5000, 15_000, 30_000];
const ISLAND_CLASS = "vk-island";
const KEEP_SERVER_MARKUP = { __html: "" };

export function island<P extends object>(
  load: () => Promise<ComponentType<P>>,
  {
    gate = afterFirstContentfulPaint,
    retryDelaysMs = RETRY_DELAYS_MS,
    reloadDelaysMs = ISLAND_RELOAD_DELAYS_MS,
    timeoutMs = ISLAND_TIMEOUT_MS,
    as: Tag = "span",
  }: IslandOptions = {},
): Island<P> {
  const loader = islandLoader(load, { gate, retryDelaysMs, reloadDelaysMs, timeoutMs });

  function Hydrated(props: P): ReactNode {
    const hydrated = useHydrated();
    const [mine] = useState(loader.attempt);
    const [serverProps, setServerProps] = useState(() => (hydrated ? undefined : props));
    const [late, setLate] = useState<ComponentType<P>>();
    const Component = use(mine);
    const gaveUpHere = Component === ISLAND_FAILED;

    useEffect(() => {
      if (!gaveUpHere) return;
      return loader.awaitTakeover((next) => setLate(() => next));
    }, [gaveUpHere]);

    const Live = gaveUpHere ? late : Component;
    if (Live !== undefined) {
      return (
        <Tag key="live" className={ISLAND_CLASS}>
          <Live {...props} />
        </Tag>
      );
    }
    if (serverProps === undefined) return null;
    if (!sameValue(props, serverProps)) {
      setServerProps(undefined);
      return null;
    }
    return (
      <Tag
        key="kept"
        className={ISLAND_CLASS}
        dangerouslySetInnerHTML={KEEP_SERVER_MARKUP}
        suppressHydrationWarning
      />
    );
  }

  function Island(props: P): ReactNode {
    return (
      <Activity mode="visible">
        <Hydrated {...props} />
      </Activity>
    );
  }
  return Object.assign(Island, {
    preload: loader.preload,
    pendingTakeovers: loader.pendingTakeovers,
  });
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
  if (rendersOnServer()) await Promise.all(loads);
}
