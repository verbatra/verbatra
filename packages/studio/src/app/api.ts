import { budgetTracking, createRateBudget, type RateBudget } from "../client/rate-budget.js";
import type {
  ConnectionStatus,
  EventSourceLike,
  MessageEventLike,
  ProbeOutcome,
} from "../client/reconnect.js";
import { createReconnectController } from "../client/reconnect.js";
import { createReviewOverlayStore, type ReviewOverlayStore } from "../client/review-overlay.js";
import type { FetchLike, RpcClient } from "../client/rpc-client.js";
import { createRpcClient } from "../client/rpc-client.js";
import { createSessionStore, type SessionStore } from "../client/state.js";
import type { RefreshEvent } from "../shared/sse-events.js";
import {
  type AgentToolsStatusStore,
  createAgentToolsStatusStore,
} from "../webmcp/registration-store.js";

const browserFetch: FetchLike = (url, init) => fetch(url, init);

export const sessionStore: SessionStore = createSessionStore();

export const rateBudget: RateBudget = createRateBudget();

export const rpcClient: RpcClient = budgetTracking(
  createRpcClient({ fetchImpl: browserFetch, session: sessionStore }),
  rateBudget,
);

export const reviewOverlayStore: ReviewOverlayStore = createReviewOverlayStore();

export const agentToolsStatusStore: AgentToolsStatusStore = createAgentToolsStatusStore();

export const agentToolsAbortController = new AbortController();

const refreshListeners = new Set<(event: RefreshEvent) => void>();

export const refreshBus = {
  subscribe(listener: (event: RefreshEvent) => void): () => void {
    refreshListeners.add(listener);
    return () => {
      refreshListeners.delete(listener);
    };
  },
};

function notifyRefresh(event: RefreshEvent): void {
  for (const listener of refreshListeners) {
    listener(event);
  }
}

const connectionListeners = new Set<(status: ConnectionStatus) => void>();

let connectionStatus: ConnectionStatus = "reconnecting";

export const connectionStore = {
  getStatus(): ConnectionStatus {
    return connectionStatus;
  },
  subscribe(listener: (status: ConnectionStatus) => void): () => void {
    connectionListeners.add(listener);
    return () => {
      connectionListeners.delete(listener);
    };
  },
};

function notifyConnectionStatus(status: ConnectionStatus): void {
  if (status === connectionStatus) {
    return;
  }
  connectionStatus = status;
  for (const listener of connectionListeners) {
    listener(status);
  }
}

function browserCreateEventSource(url: string): EventSourceLike {
  const source = new EventSource(url);
  return {
    get readyState(): number {
      return source.readyState;
    },
    addEventListener(type: string, listener: (event: MessageEventLike) => void): void {
      source.addEventListener(type, (event) => {
        const data = "data" in event && typeof event.data === "string" ? event.data : "";
        listener({ data });
      });
    },
    close: (): void => source.close(),
  };
}

async function probeSession(): Promise<ProbeOutcome> {
  try {
    const result = await rpcClient.call("project.snapshot", {});
    if (!result.ok && result.error.code === "SESSION_EXPIRED") {
      return "unauthorized";
    }
    return "network-error";
  } catch {
    return "network-error";
  }
}

createReconnectController({
  url: "/events",
  createEventSource: browserCreateEventSource,
  probe: probeSession,
  session: sessionStore,
  onRefresh: notifyRefresh,
  onStatusChange: notifyConnectionStatus,
});
