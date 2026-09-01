import { redact } from "@verbatra/sdk";
import type { RefreshEvent, ShutdownEvent } from "../shared/sse-events.js";
import { SSE_EVENT_REFRESH, SSE_EVENT_SHUTDOWN } from "../shared/sse-events.js";

const DEFAULT_HEARTBEAT_MS = 15_000;

export interface SseClientResponse {
  write(chunk: string): boolean;
  end(): void;
  once(event: "close" | "error", listener: (...args: unknown[]) => void): void;
}

export interface SseHub {
  register(response: SseClientResponse): void;
  broadcastRefresh(event: RefreshEvent): void;
  closeAll(): void;
  readonly size: number;
}

function tryWrite(response: SseClientResponse, event: string, data: unknown): boolean {
  const frame = redact(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    return response.write(frame);
  } catch {
    return false;
  }
}

function tryWriteHeartbeat(response: SseClientResponse): boolean {
  try {
    return response.write(`: heartbeat ${Date.now()}\n\n`);
  } catch {
    return false;
  }
}

function tryEnd(response: SseClientResponse): void {
  try {
    response.end();
  } catch {}
}

export interface SseHubOptions {
  readonly heartbeatIntervalMs?: number;
}

export function createSseHub(options: SseHubOptions = {}): SseHub {
  const clients = new Set<SseClientResponse>();

  function deregister(response: SseClientResponse): void {
    clients.delete(response);
  }

  function register(response: SseClientResponse): void {
    clients.add(response);
    response.once("close", () => deregister(response));
    response.once("error", () => deregister(response));
  }

  function broadcastRefresh(event: RefreshEvent): void {
    for (const response of clients) {
      if (!tryWrite(response, SSE_EVENT_REFRESH, event)) {
        deregister(response);
      }
    }
  }

  function tickHeartbeat(): void {
    for (const response of clients) {
      if (!tryWriteHeartbeat(response)) {
        deregister(response);
      }
    }
  }

  const heartbeatTimer = setInterval(
    tickHeartbeat,
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS,
  );
  heartbeatTimer.unref?.();

  function closeAll(): void {
    clearInterval(heartbeatTimer);
    const shutdownEvent: ShutdownEvent = { at: new Date().toISOString() };
    for (const response of clients) {
      tryWrite(response, SSE_EVENT_SHUTDOWN, shutdownEvent);
      tryEnd(response);
    }
    clients.clear();
  }

  return {
    register,
    broadcastRefresh,
    closeAll,
    get size(): number {
      return clients.size;
    },
  };
}
