// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "../client/reconnect.js";
import type { RefreshEvent } from "../shared/sse-events.js";

type Listener = (event: { readonly data?: unknown }) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = 0;
  closed = false;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(data === undefined ? {} : { data });
    }
  }
}

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (source === undefined) {
    throw new Error("the module never opened a connection");
  }
  return source;
}

interface StubbedResponse {
  readonly status: number;
  readonly body: unknown;
}

let fetchResponse: StubbedResponse | Error = { status: 200, body: { ok: true, result: {} } };
const fetchCalls: Array<{ url: string; init: unknown }> = [];

async function loadApi(): Promise<typeof import("./api.js")> {
  vi.resetModules();
  return import("./api.js");
}

beforeEach(() => {
  FakeEventSource.instances = [];
  fetchCalls.length = 0;
  fetchResponse = { status: 200, body: { ok: true, result: {} } };
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", (url: string, init: unknown) => {
    fetchCalls.push({ url, init });
    if (fetchResponse instanceof Error) {
      return Promise.reject(fetchResponse);
    }
    const { status, body } = fetchResponse;
    return Promise.resolve({ status, json: () => Promise.resolve(body) });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("api module wiring", () => {
  it("opens the live-refresh stream against /events as soon as it is imported", async () => {
    await loadApi();

    expect(latestSource().url).toBe("/events");
  });

  it("posts an rpc call to /rpc as a json envelope naming the method and its params", async () => {
    const { rpcClient } = await loadApi();
    fetchResponse = { status: 200, body: { ok: true, result: { available: false, commits: [] } } };

    await rpcClient.call("history.list", {});

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe("/rpc");
    expect(fetchCalls[0]?.init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ method: "history.list", params: {} }),
    });
  });

  it("marks the shared session store expired when an rpc call is answered with a 401", async () => {
    const { rpcClient, sessionStore } = await loadApi();
    fetchResponse = { status: 401, body: {} };

    await rpcClient.call("history.list", {});

    expect(sessionStore.getState().kind).toBe("session-expired");
  });
});

describe("the shared refresh bus", () => {
  it("delivers a parsed refresh frame to every subscriber", async () => {
    const { refreshBus } = await loadApi();
    const received: RefreshEvent[] = [];
    refreshBus.subscribe((event) => received.push(event));

    latestSource().emit(
      "refresh",
      JSON.stringify({ reason: "targets", at: "2026-08-11T00:00:00.000Z", locale: "de" }),
    );

    expect(received).toEqual([{ reason: "targets", at: "2026-08-11T00:00:00.000Z", locale: "de" }]);
  });

  it("stops delivering once a subscriber unsubscribes", async () => {
    const { refreshBus } = await loadApi();
    const received: RefreshEvent[] = [];
    const unsubscribe = refreshBus.subscribe((event) => received.push(event));

    unsubscribe();
    latestSource().emit("refresh", JSON.stringify({ reason: "lock", at: "2026-08-11T00:00:00Z" }));

    expect(received).toEqual([]);
  });

  it("drops a frame whose payload is not a string, rather than forwarding a broken event", async () => {
    const { refreshBus } = await loadApi();
    const received: RefreshEvent[] = [];
    refreshBus.subscribe((event) => received.push(event));

    latestSource().emit("refresh", { not: "a string" });

    expect(received).toEqual([]);
  });
});

describe("the shared connection status store", () => {
  it("starts reconnecting, because nothing has opened yet", async () => {
    const { connectionStore } = await loadApi();

    expect(connectionStore.getStatus()).toBe("reconnecting");
  });

  it("reports live once the stream opens", async () => {
    const { connectionStore } = await loadApi();
    const seen: ConnectionStatus[] = [];
    connectionStore.subscribe((status) => seen.push(status));

    latestSource().emit("open");

    expect(connectionStore.getStatus()).toBe("live");
    expect(seen).toEqual(["live"]);
  });

  it("notifies once per actual transition, not once per repeated status", async () => {
    const { connectionStore } = await loadApi();
    const seen: ConnectionStatus[] = [];
    connectionStore.subscribe((status) => seen.push(status));
    const source = latestSource();

    source.emit("open");
    source.emit("open");

    expect(seen).toEqual(["live"]);
  });

  it("returns to reconnecting when the stream errors, and stops notifying an unsubscribed listener", async () => {
    const { connectionStore } = await loadApi();
    const seen: ConnectionStatus[] = [];
    const unsubscribe = connectionStore.subscribe((status) => seen.push(status));
    const source = latestSource();

    source.emit("open");
    source.emit("error");
    unsubscribe();
    source.emit("open");

    expect(seen).toEqual(["live", "reconnecting"]);
    expect(connectionStore.getStatus()).toBe("live");
  });
});

describe("the reconnect probe", () => {
  it("treats a session-expired answer as terminal and expires the shared session", async () => {
    const { sessionStore } = await loadApi();
    fetchResponse = { status: 401, body: {} };
    const source = latestSource();
    source.readyState = 2;

    source.emit("error");
    await vi.waitFor(() => expect(sessionStore.getState().kind).toBe("session-expired"));

    expect(source.closed).toBe(true);
  });

  it("treats any other answer as a transient failure and reconnects after the base backoff", async () => {
    vi.useFakeTimers();
    await loadApi();
    fetchResponse = { status: 200, body: { ok: true, result: {} } };
    const source = latestSource();
    source.readyState = 2;

    source.emit("error");
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it("treats a rejected probe as a transient failure too, rather than letting it escape", async () => {
    vi.useFakeTimers();
    const { sessionStore } = await loadApi();
    fetchResponse = new Error("the network is down");
    const source = latestSource();
    source.readyState = 2;

    source.emit("error");
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(sessionStore.getState().kind).toBe("active");
  });

  it("leaves a stream that is still retrying on its own alone", async () => {
    vi.useFakeTimers();
    await loadApi();
    const source = latestSource();
    source.readyState = 0;

    source.emit("error");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(source.closed).toBe(false);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(fetchCalls).toEqual([]);
  });
});

describe("the module-scope stores the dashboard shares", () => {
  it("hands out an agent-tools store that starts empty, so nothing renders for a surface never opted in", async () => {
    const { agentToolsStatusStore } = await loadApi();

    expect(agentToolsStatusStore.getFailures()).toEqual([]);
  });
});
