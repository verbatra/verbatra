import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach } from "vitest";
import { budgetTracking, createRateBudget, type RateBudget } from "../client/rate-budget.js";
import type { ConnectionStatus } from "../client/reconnect.js";
import type { ReviewOverlayStore } from "../client/review-overlay.js";
import { createReviewOverlayStore } from "../client/review-overlay.js";
import type { RpcClient } from "../client/rpc-client.js";
import type { SessionStore } from "../client/state.js";
import { createSessionStore } from "../client/state.js";
import type { RefreshEvent } from "../shared/sse-events.js";
import type { AgentToolsStatusStore } from "../webmcp/registration-store.js";
import { createAgentToolsStatusStore } from "../webmcp/registration-store.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  readonly container: HTMLDivElement;
  readonly root: Root;
}

const mounted: Mounted[] = [];

export interface RenderResult {
  readonly container: HTMLDivElement;
  rerender(node: ReactNode): void;
  unmount(): void;
  query(selector: string): HTMLElement | null;
  get(selector: string): HTMLElement;
  all(selector: string): HTMLElement[];
  getByText(selector: string, text: string): HTMLElement;
  text(): string;
}

function makeResult(container: HTMLDivElement, root: Root): RenderResult {
  return {
    container,
    rerender(node: ReactNode): void {
      act(() => {
        root.render(node);
      });
    },
    unmount(): void {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    query: (selector: string): HTMLElement | null => container.querySelector(selector),
    get(selector: string): HTMLElement {
      const element = container.querySelector<HTMLElement>(selector);
      if (element === null) {
        throw new Error(`no element matched ${selector} in: ${container.innerHTML}`);
      }
      return element;
    },
    all: (selector: string): HTMLElement[] => [
      ...container.querySelectorAll<HTMLElement>(selector),
    ],
    getByText(selector: string, text: string): HTMLElement {
      const match = [...container.querySelectorAll<HTMLElement>(selector)].find(
        (element) => element.textContent?.trim() === text,
      );
      if (match === undefined) {
        throw new Error(`no ${selector} had the text ${JSON.stringify(text)}`);
      }
      return match;
    },
    text: (): string => container.textContent ?? "",
  };
}

export function render(node: ReactNode): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  act(() => {
    root.render(node);
  });
  return makeResult(container, root);
}

export async function renderAsync(node: ReactNode): Promise<RenderResult> {
  const result = render(node);
  await flush();
  return result;
}

export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

export function click(element: Element): void {
  act(() => {
    (element as HTMLElement).click();
  });
}

export async function clickAsync(element: Element): Promise<void> {
  click(element);
  await flush();
}

export function pressKey(key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

function setNativeValue(element: HTMLElement, prototype: object, value: string): void {
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
}

export function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    setNativeValue(element, prototype, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function selectOption(element: HTMLSelectElement, value: string): void {
  act(() => {
    setNativeValue(element, HTMLSelectElement.prototype, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export type StubRpcResult =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export type StubRpcHandler = (params: unknown) => StubRpcResult | Promise<StubRpcResult>;

export interface RecordedRpcCall {
  readonly method: string;
  readonly params: unknown;
}

const handlers = new Map<string, StubRpcHandler>();

export const rpcCalls: RecordedRpcCall[] = [];

export function rpcError(code: string, message = code): StubRpcResult {
  return { ok: false, error: { code, message } };
}

export function stubRpc(stubs: Readonly<Record<string, StubRpcResult | StubRpcHandler>>): void {
  for (const [method, stub] of Object.entries(stubs)) {
    handlers.set(method, typeof stub === "function" ? stub : () => stub);
  }
}

async function callRpc(method: string, params: unknown): Promise<StubRpcResult> {
  rpcCalls.push({ method, params });
  const handler = handlers.get(method);
  if (handler === undefined) {
    return rpcError("RPC_NOT_STUBBED", `no stub registered for ${method}`);
  }
  return handler(params);
}

let stores = freshStores();

function freshStores(): {
  session: SessionStore;
  overlay: ReviewOverlayStore;
  agentTools: AgentToolsStatusStore;
  rateBudget: RateBudget;
} {
  return {
    rateBudget: createRateBudget(),
    session: createSessionStore(),
    overlay: createReviewOverlayStore(),
    agentTools: createAgentToolsStatusStore(),
  };
}

export const sessionStore: SessionStore = {
  getState: () => stores.session.getState(),
  markSessionExpired: () => stores.session.markSessionExpired(),
  subscribe: (listener) => stores.session.subscribe(listener),
};

export const reviewOverlayStore: ReviewOverlayStore = {
  isActioned: (entry) => stores.overlay.isActioned(entry),
  markActioned: (entry) => stores.overlay.markActioned(entry),
  subscribe: (listener) => stores.overlay.subscribe(listener),
};

export const rateBudget: RateBudget = {
  record: (method, params, sentAt, response) =>
    stores.rateBudget.record(method, params, sentAt, response),
  check: (method, params, limits, now) => stores.rateBudget.check(method, params, limits, now),
};

export const agentToolsStatusStore: AgentToolsStatusStore = {
  getFailures: () => stores.agentTools.getFailures(),
  publish: (failures) => stores.agentTools.publish(failures),
  subscribe: (listener) => stores.agentTools.subscribe(listener),
};

const refreshListeners = new Set<(event: RefreshEvent) => void>();

export const refreshBus = {
  subscribe(listener: (event: RefreshEvent) => void): () => void {
    refreshListeners.add(listener);
    return () => {
      refreshListeners.delete(listener);
    };
  },
};

export function emitRefresh(event: RefreshEvent): void {
  act(() => {
    for (const listener of [...refreshListeners]) {
      listener(event);
    }
  });
}

const connectionListeners = new Set<(status: ConnectionStatus) => void>();
let connectionStatus: ConnectionStatus = "live";

export const connectionStore = {
  getStatus: (): ConnectionStatus => connectionStatus,
  subscribe(listener: (status: ConnectionStatus) => void): () => void {
    connectionListeners.add(listener);
    return () => {
      connectionListeners.delete(listener);
    };
  },
};

export function setConnectionStatus(status: ConnectionStatus): void {
  connectionStatus = status;
  act(() => {
    for (const listener of [...connectionListeners]) {
      listener(status);
    }
  });
}

export interface AppApiModule {
  readonly rpcClient: RpcClient;
  readonly rateBudget: RateBudget;
  readonly sessionStore: SessionStore;
  readonly reviewOverlayStore: ReviewOverlayStore;
  readonly agentToolsStatusStore: AgentToolsStatusStore;
  readonly refreshBus: typeof refreshBus;
  readonly connectionStore: typeof connectionStore;
}

export function apiMock(): AppApiModule {
  return {
    rpcClient: budgetTracking({ call: callRpc } as unknown as RpcClient, rateBudget),
    rateBudget,
    sessionStore,
    reviewOverlayStore,
    agentToolsStatusStore,
    refreshBus,
    connectionStore,
  };
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
  handlers.clear();
  rpcCalls.length = 0;
  refreshListeners.clear();
  connectionListeners.clear();
  connectionStatus = "live";
  stores = freshStores();
});
