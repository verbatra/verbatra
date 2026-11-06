import { type ButtonSize, type ButtonVariant, buttonClasses } from "@verbatra/ui";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach } from "vitest";
import { budgetTracking, createRateBudget, type RateBudget } from "../client/rate-budget.js";
import type { ConnectionStatus } from "../client/reconnect.js";
import type { ReviewQueueData } from "../client/review-queue-data.js";
import type { RpcClient } from "../client/rpc-client.js";
import type { RefreshableView, SessionStore, StructuredError } from "../client/state.js";
import { createSessionStore } from "../client/state.js";
import type {
  GlossaryGetResult,
  GlossaryTermView,
  GlossaryWriteResult,
} from "../shared/rpc/glossary.js";
import type { RefreshEvent } from "../shared/sse-events.js";
import type { AgentToolsStatusStore } from "../webmcp/registration-store.js";
import { createAgentToolsStatusStore } from "../webmcp/registration-store.js";
import { resetIcuPreviewSession } from "./icu-preview-open.js";

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
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryAfterSeconds?: number;
      };
    };

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
  agentTools: AgentToolsStatusStore;
  rateBudget: RateBudget;
} {
  return {
    rateBudget: createRateBudget(),
    session: createSessionStore(),
    agentTools: createAgentToolsStatusStore(),
  };
}

export const sessionStore: SessionStore = {
  getState: () => stores.session.getState(),
  markSessionExpired: () => stores.session.markSessionExpired(),
  subscribe: (listener) => stores.session.subscribe(listener),
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
  readonly agentToolsStatusStore: AgentToolsStatusStore;
  readonly refreshBus: typeof refreshBus;
  readonly connectionStore: typeof connectionStore;
}

export function apiMock(): AppApiModule {
  return {
    rpcClient: budgetTracking({ call: callRpc } as unknown as RpcClient, rateBudget),
    rateBudget,
    sessionStore,
    agentToolsStatusStore,
    refreshBus,
    connectionStore,
  };
}

const viewportListeners = new Set<EventListenerOrEventListenerObject>();
let wideViewport = false;
let restoreMatchMedia: (() => void) | null = null;

function mediaList(query: string): MediaQueryList {
  return {
    media: query,
    get matches(): boolean {
      return wideViewport;
    },
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
      viewportListeners.add(listener);
    },
    removeEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
      viewportListeners.delete(listener);
    },
    dispatchEvent: () => false,
  };
}

function installMatchMedia(): void {
  if (restoreMatchMedia === null) {
    const original = window.matchMedia;
    restoreMatchMedia = () => {
      window.matchMedia = original;
    };
  }
  window.matchMedia = mediaList;
}

const HISTORY_FIRST_WAIT_MS = 400;
const HISTORY_QUIET_MS = 150;
const HISTORY_MAX_MS = 3000;
const HISTORY_MAX_EVENTS = 200;

export function settleHistory(): Promise<void> {
  return new Promise((resolve) => {
    let events = 0;
    let timer = setTimeout(done, HISTORY_FIRST_WAIT_MS);
    const cap = setTimeout(done, HISTORY_MAX_MS);
    function bump(): void {
      events += 1;
      clearTimeout(timer);
      timer = setTimeout(done, events >= HISTORY_MAX_EVENTS ? 0 : HISTORY_QUIET_MS);
    }
    function done(): void {
      clearTimeout(timer);
      clearTimeout(cap);
      window.removeEventListener("popstate", bump);
      window.removeEventListener("hashchange", bump);
      resolve();
    }
    window.addEventListener("popstate", bump);
    window.addEventListener("hashchange", bump);
  });
}

export function stubViewport(wide: boolean): void {
  wideViewport = wide;
  installMatchMedia();
}

export function resizeViewport(wide: boolean): void {
  wideViewport = wide;
  act(() => {
    for (const listener of [...viewportListeners]) {
      const change = new Event("change");
      if (typeof listener === "function") {
        listener(change);
      } else {
        listener.handleEvent(change);
      }
    }
  });
}

afterEach(() => {
  restoreMatchMedia?.();
  restoreMatchMedia = null;
  viewportListeners.clear();
  wideViewport = false;
  for (const entry of mounted.splice(0)) {
    act(() => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
  handlers.clear();
  rpcCalls.length = 0;
  resetIcuPreviewSession();
  refreshListeners.clear();
  connectionListeners.clear();
  connectionStatus = "live";
  stores = freshStores();
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
});

export function callerClasses(button: HTMLElement): readonly string[] {
  const own = new Set(
    buttonClasses({
      variant: button.dataset.variant as ButtonVariant,
      size: button.dataset.size as ButtonSize,
    }).split(" "),
  );
  return button.className.split(" ").filter((name) => name !== "" && !own.has(name));
}

export function metricCard(view: RenderResult, label: string): HTMLElement {
  const card = view.all('[role="group"]').find((group) => {
    const labelledBy = group.getAttribute("aria-labelledby");
    const name = labelledBy === null ? null : document.getElementById(labelledBy);
    return name?.textContent?.trim() === label;
  });
  if (card === undefined) {
    throw new Error(`no metric card is named ${JSON.stringify(label)}`);
  }
  return card;
}

export function hasMetricCard(view: RenderResult, label: string): boolean {
  return view.all('[role="group"]').some((group) => {
    const labelledBy = group.getAttribute("aria-labelledby");
    return document.getElementById(labelledBy ?? "")?.textContent?.trim() === label;
  });
}

export function metricFigure(view: RenderResult, label: string): HTMLElement {
  const figure = metricCard(view, label).querySelector<HTMLElement>("[data-metric-value]");
  if (figure === null) {
    throw new Error(`the ${JSON.stringify(label)} card has no figure`);
  }
  return figure;
}

export function metricValue(view: RenderResult, label: string): string {
  return metricFigure(view, label).textContent ?? "";
}

export function metricHint(view: RenderResult, label: string): string | null {
  return metricCard(view, label).querySelector("[data-metric-hint]")?.textContent ?? null;
}

export function arbitraryClasses(classes: readonly string[]): readonly string[] {
  return classes.filter((name) => name.includes("[") || name.includes("(--"));
}

export function reviewQueueView(waiting: number): RefreshableView<ReviewQueueData> {
  const needsReview = Array.from({ length: waiting }, (_, index) => ({
    key: `key.${index}`,
    reasons: ["EQUALS_SOURCE" as const],
    provenance: { origin: "machine" as const, reviewState: "unreviewed" as const },
  }));
  return {
    kind: "data",
    stale: false,
    data: { available: true, locales: [{ locale: "de", needsReview }] },
  } as RefreshableView<ReviewQueueData>;
}

export function unavailableQueueView(): RefreshableView<ReviewQueueData> {
  return {
    kind: "data",
    stale: false,
    data: { available: false, reason: "provenance-unreadable" },
  };
}

export function failedQueueView(error: StructuredError): RefreshableView<ReviewQueueData> {
  return { kind: "error", error };
}

export function sharedTerm(source: string, target: string): GlossaryTermView {
  return {
    source,
    target,
    targets: {},
    forbidden: {},
    caseSensitive: false,
    byLocale: {
      de: { target, inherited: true, forbidden: [] },
      fr: { target, inherited: true, forbidden: [] },
    },
  };
}

export const DASHBOARD_TERM: GlossaryTermView = {
  source: "Dashboard",
  target: "Dashboard",
  targets: { de: "Übersicht" },
  forbidden: { de: ["Instrumententafel"] },
  caseSensitive: true,
  note: "The start page after sign-in",
  partOfSpeech: "noun",
  byLocale: {
    de: { target: "Übersicht", inherited: false, forbidden: ["Instrumententafel"] },
    fr: { target: "Dashboard", inherited: true, forbidden: [] },
  },
};

export const FILE_BACKED_GLOSSARY: GlossaryGetResult = {
  indicator: { source: "file", path: "glossary.json" },
  version: 2,
  locales: ["de", "fr"],
  terms: [sharedTerm("verbatra", "Verbatra"), sharedTerm("checkout", "Kasse"), DASHBOARD_TERM],
  doNotTranslate: [{ term: "Northwind", caseSensitive: true }],
  redactedTerms: [],
};

export function writeAnswer(result: GlossaryWriteResult): {
  readonly ok: true;
  readonly result: GlossaryWriteResult;
} {
  return { ok: true, result };
}

export interface DeferredAnswer {
  readonly promise: Promise<StubRpcResult>;
  resolve(answer: StubRpcResult): void;
}

export function deferredAnswer(): DeferredAnswer {
  let settle: (answer: StubRpcResult) => void = () => {};
  const promise = new Promise<StubRpcResult>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: settle };
}

function accessibleName(element: HTMLElement, view: RenderResult): string {
  const label = element.getAttribute("aria-label");
  if (label !== null) {
    return label;
  }
  const labelled =
    element.id === "" ? undefined : view.query(`label[for="${element.id}"]`)?.textContent;
  return (labelled ?? element.textContent ?? "").trim();
}

export function elementNamed(view: RenderResult, selector: string, name: string): HTMLElement {
  const match = view.all(selector).find((element) => accessibleName(element, view) === name);
  if (match === undefined) {
    throw new Error(`no ${selector} named ${JSON.stringify(name)}`);
  }
  return match;
}

export function findNamed(
  view: RenderResult,
  selector: string,
  name: string,
): HTMLElement | undefined {
  return view.all(selector).find((element) => accessibleName(element, view) === name);
}

export function glossaryWrites(): readonly unknown[] {
  return rpcCalls.filter((call) => call.method === "glossary.write");
}

export function buttonNamed(view: RenderResult, name: string): HTMLElement {
  return elementNamed(view, "button", name);
}

export function textboxNamed(view: RenderResult, name: string): HTMLInputElement {
  return elementNamed(view, "input, textarea", name) as HTMLInputElement;
}

export function answersInOrder(
  results: readonly [StubRpcResult, ...StubRpcResult[]],
): StubRpcHandler {
  let index = 0;
  return () => {
    const answer = results[Math.min(index, results.length - 1)] ?? results[0];
    index += 1;
    return answer;
  };
}
