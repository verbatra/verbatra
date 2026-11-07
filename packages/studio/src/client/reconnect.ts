import type { RefreshEvent } from "../shared/sse-events.js";
import { SSE_EVENT_REFRESH, SSE_EVENT_SHUTDOWN } from "../shared/sse-events.js";
import type { SessionStore } from "./state.js";

export const EVENT_SOURCE_CLOSED = 2;

export interface MessageEventLike {
  readonly data: string;
}

export interface EventSourceLike {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: MessageEventLike) => void): void;
  close(): void;
}

export type CreateEventSource = (url: string) => EventSourceLike;

export type ProbeOutcome = "unauthorized" | "network-error";

export type ProbeFn = () => Promise<ProbeOutcome>;

export type ConnectionStatus = "live" | "reconnecting";

export interface ReconnectControllerOptions {
  readonly url: string;
  readonly createEventSource: CreateEventSource;
  readonly probe: ProbeFn;
  readonly session: SessionStore;
  readonly onRefresh: (event: RefreshEvent) => void;
  readonly onStatusChange?: (status: ConnectionStatus) => void;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
}

export interface ReconnectController {
  stop(): void;
}

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const BACKOFF_FACTOR = 2;

function computeBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * BACKOFF_FACTOR ** attempt, maxDelayMs);
}

function parseDelta(raw: unknown): RefreshEvent["delta"] {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { added, changed, removed } = raw as {
    added?: unknown;
    changed?: unknown;
    removed?: unknown;
  };
  if (typeof added === "number" && typeof changed === "number" && typeof removed === "number") {
    return { added, changed, removed };
  }
  return undefined;
}

function parseRefreshEvent(data: string): RefreshEvent | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const { reason, at, locale, delta } = parsed as {
    reason?: unknown;
    at?: unknown;
    locale?: unknown;
    delta?: unknown;
  };
  if (
    (reason === "source" || reason === "targets" || reason === "lock" || reason === "git") &&
    typeof at === "string"
  ) {
    const parsedDelta = parseDelta(delta);
    return {
      reason,
      at,
      ...(typeof locale === "string" ? { locale } : {}),
      ...(parsedDelta !== undefined ? { delta: parsedDelta } : {}),
    };
  }
  return undefined;
}

export function createReconnectController(
  options: ReconnectControllerOptions,
): ReconnectController {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let stopped = false;
  let attempt = 0;
  let current: EventSourceLike | undefined;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  function clearPendingTimer(): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      pendingTimer = undefined;
    }
  }

  function handleRefresh(event: MessageEventLike): void {
    const refreshEvent = parseRefreshEvent(event.data);
    if (refreshEvent !== undefined) {
      options.onRefresh(refreshEvent);
    }
  }

  function handleShutdown(): void {
    stopped = true;
    clearPendingTimer();
    current?.close();
    current = undefined;
    options.session.markSessionExpired();
  }

  function scheduleReconnect(): void {
    const delay = computeBackoffDelay(attempt, baseDelayMs, maxDelayMs);
    attempt += 1;
    pendingTimer = setTimeout(() => {
      pendingTimer = undefined;
      connect();
    }, delay);
  }

  async function probeAndMaybeReconnect(): Promise<void> {
    const outcome = await options.probe();
    if (stopped) {
      return;
    }
    if (outcome === "unauthorized") {
      stopped = true;
      options.session.markSessionExpired();
      return;
    }
    scheduleReconnect();
  }

  function handleError(source: EventSourceLike): void {
    if (stopped) {
      return;
    }
    options.onStatusChange?.("reconnecting");
    if (source.readyState !== EVENT_SOURCE_CLOSED) {
      return;
    }
    source.close();
    void probeAndMaybeReconnect();
  }

  function handleOpen(): void {
    attempt = 0;
    options.onStatusChange?.("live");
  }

  function connect(): void {
    if (stopped) {
      return;
    }
    const source = options.createEventSource(options.url);
    current = source;
    source.addEventListener("open", handleOpen);
    source.addEventListener(SSE_EVENT_REFRESH, handleRefresh);
    source.addEventListener(SSE_EVENT_SHUTDOWN, handleShutdown);
    source.addEventListener("error", () => handleError(source));
  }

  connect();

  return {
    stop(): void {
      stopped = true;
      clearPendingTimer();
      current?.close();
      current = undefined;
    },
  };
}
