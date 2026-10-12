import {
  Activity,
  type ComponentType,
  isValidElement,
  type ReactNode,
  use,
  useEffect,
  useState,
} from "react";
import { afterFirstContentfulPaint } from "@/lib/first-paint";
import { RETRY_DELAYS_MS, retrying } from "@/lib/retry";
import { useHydrated } from "@/lib/use-hydrated";

export type Island<P extends object> = ((props: P) => ReactNode) & {
  preload: () => Promise<unknown>;
};

export type IslandGate = () => Promise<void>;

export type IslandTag = "span" | "div";

export interface IslandOptions {
  gate?: IslandGate;
  retryDelaysMs?: ReadonlyArray<number>;
  timeoutMs?: number;
  as?: IslandTag;
}

const ISLAND_FAILED = Symbol("island-failed");

type Loaded<P> = ComponentType<P> | typeof ISLAND_FAILED;

type Settled<T> = Promise<T>;

function settledState(promise: Promise<unknown> | undefined): { status?: string; value?: unknown } {
  return (promise ?? {}) as { status?: string; value?: unknown };
}

function failed(): typeof ISLAND_FAILED {
  return ISLAND_FAILED;
}

function within<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    const finish = (value: T | F) => {
      clearTimeout(timer);
      resolve(value);
    };
    promise.then(finish, () => finish(fallback));
  });
}

function settle<T>(promise: Promise<T>): Settled<T> {
  const settled: Settled<T> = promise.then((value) => {
    Object.assign(settled, { status: "fulfilled", value });
    return value;
  });
  return settled;
}

function gaveUp(promise: Settled<unknown> | undefined): boolean {
  return settledState(promise).value === ISLAND_FAILED;
}

function rendersOnServer(): boolean {
  return typeof window === "undefined";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameEntries(next: Record<string, unknown>, previous: Record<string, unknown>): boolean {
  const keys = Object.keys(next);
  return (
    keys.length === Object.keys(previous).length &&
    keys.every((key) => Object.hasOwn(previous, key) && sameValue(next[key], previous[key]))
  );
}

function sameValue(next: unknown, previous: unknown): boolean {
  if (Object.is(next, previous)) return true;
  if (isValidElement(next) && isValidElement(previous)) {
    return (
      next.type === previous.type &&
      next.key === previous.key &&
      sameValue(next.props, previous.props)
    );
  }
  if (Array.isArray(next) && Array.isArray(previous)) {
    return (
      next.length === previous.length &&
      next.every((item, index) => sameValue(item, previous[index]))
    );
  }
  return isPlainObject(next) && isPlainObject(previous) && sameEntries(next, previous);
}

const ISLAND_TIMEOUT_MS = 8000;
const ISLAND_CLASS = "vk-island";
const KEEP_SERVER_MARKUP = { __html: "" };

export function island<P extends object>(
  load: () => Promise<ComponentType<P>>,
  {
    gate = afterFirstContentfulPaint,
    retryDelaysMs = RETRY_DELAYS_MS,
    timeoutMs = ISLAND_TIMEOUT_MS,
    as: Tag = "span",
  }: IslandOptions = {},
): Island<P> {
  let loading: Settled<Loaded<P>> | undefined;
  let loadingSince = 0;
  let attempt: Settled<Loaded<P>> | undefined;

  const loadComponent = (): Settled<Loaded<P>> => {
    if (loading === undefined || gaveUp(loading)) {
      loadingSince = Date.now();
      loading = settle(
        rendersOnServer() ? load() : gate().then(() => retrying(load, retryDelaysMs).catch(failed)),
      );
    }
    return loading;
  };
  const currentAttempt = (): Settled<Loaded<P>> => {
    if (attempt !== undefined) return attempt;
    const loaded = loadComponent();
    attempt =
      rendersOnServer() || settledState(loaded).status === "fulfilled"
        ? loaded
        : settle(within(loaded, loadingSince + timeoutMs - Date.now(), ISLAND_FAILED));
    return attempt;
  };
  const consume = (used: Settled<Loaded<P>>) => {
    if (attempt === used) attempt = undefined;
  };

  function Hydrated(props: P): ReactNode {
    const hydrated = useHydrated();
    const [mine] = useState(currentAttempt);
    const [serverProps, setServerProps] = useState(() => (hydrated ? undefined : props));
    const [late, setLate] = useState<ComponentType<P>>();
    const Component = use(mine);
    const gaveUpHere = Component === ISLAND_FAILED;

    useEffect(() => {
      if (!gaveUpHere) return;
      consume(mine);
      let active = true;
      void loadComponent().then((next) => {
        if (active && next !== ISLAND_FAILED) setLate(() => next);
      });
      return () => {
        active = false;
      };
    }, [gaveUpHere, mine]);

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
  return Object.assign(Island, { preload: loadComponent });
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
