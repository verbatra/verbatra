import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReconnectController,
  EVENT_SOURCE_CLOSED,
  type EventSourceLike,
  type ProbeOutcome,
} from "./reconnect.js";
import { createSessionStore } from "./state.js";

const EVENT_SOURCE_CONNECTING = 0;

function fakeEventSourceFactory() {
  const instances: {
    readonly url: string;
    readyState: number;
    closed: boolean;
    readonly listeners: Map<string, ((event: { data: string }) => void)[]>;
  }[] = [];

  function createEventSource(url: string): EventSourceLike {
    const listeners = new Map<string, ((event: { data: string }) => void)[]>();
    const instance = { url, readyState: EVENT_SOURCE_CONNECTING, closed: false, listeners };
    instances.push(instance);
    return {
      get readyState() {
        return instance.readyState;
      },
      addEventListener(type, listener) {
        const existing = listeners.get(type) ?? [];
        existing.push(listener);
        listeners.set(type, existing);
      },
      close() {
        instance.closed = true;
      },
    };
  }

  return {
    createEventSource,
    instances,
    fire(index: number, type: string, data = ""): void {
      const instance = instances[index];
      if (instance === undefined) {
        return;
      }
      for (const listener of instance.listeners.get(type) ?? []) {
        listener({ data });
      }
    },
    setReadyState(index: number, readyState: number): void {
      const instance = instances[index];
      if (instance !== undefined) {
        instance.readyState = readyState;
      }
    },
  };
}

function fakeProbe(sequence: ProbeOutcome[]): {
  probe: () => Promise<ProbeOutcome>;
  calls: number;
} {
  const state = { calls: 0 };
  return {
    calls: 0,
    probe: async (): Promise<ProbeOutcome> => {
      const outcome = sequence[state.calls] ?? sequence.at(-1) ?? "network-error";
      state.calls += 1;
      return outcome;
    },
  };
}

describe("createReconnectController: refresh delivery", () => {
  it("forwards a well-formed refresh event to onRefresh", () => {
    const source = fakeEventSourceFactory();
    const onRefresh = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh,
    });

    source.fire(0, "refresh", JSON.stringify({ reason: "source", at: "2026-01-01T00:00:00.000Z" }));

    expect(onRefresh).toHaveBeenCalledWith({ reason: "source", at: "2026-01-01T00:00:00.000Z" });
  });

  it("passes a git refresh through, which carries no locale and no delta", () => {
    const source = fakeEventSourceFactory();
    const onRefresh = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh,
    });

    source.fire(0, "refresh", JSON.stringify({ reason: "git", at: "2026-01-01T00:00:00.000Z" }));

    expect(onRefresh).toHaveBeenCalledWith({ reason: "git", at: "2026-01-01T00:00:00.000Z" });
  });

  it("drops a malformed refresh payload instead of throwing", () => {
    const source = fakeEventSourceFactory();
    const onRefresh = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh,
    });

    expect(() => source.fire(0, "refresh", "not json")).not.toThrow();
    expect(() =>
      source.fire(0, "refresh", JSON.stringify({ reason: "bogus", at: "x" })),
    ).not.toThrow();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("passes locale and a well-formed delta through intact alongside reason and at", () => {
    const source = fakeEventSourceFactory();
    const onRefresh = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh,
    });

    source.fire(
      0,
      "refresh",
      JSON.stringify({
        reason: "source",
        at: "2026-01-01T00:00:00.000Z",
        locale: "de",
        delta: { added: 1, changed: 2, removed: 0 },
      }),
    );

    expect(onRefresh).toHaveBeenCalledWith({
      reason: "source",
      at: "2026-01-01T00:00:00.000Z",
      locale: "de",
      delta: { added: 1, changed: 2, removed: 0 },
    });
  });

  it("parses the frame with delta absent when delta is present but malformed, instead of dropping the whole frame", () => {
    const source = fakeEventSourceFactory();
    const onRefresh = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh,
    });

    source.fire(
      0,
      "refresh",
      JSON.stringify({
        reason: "targets",
        at: "2026-01-01T00:00:00.000Z",
        locale: "fr",
        delta: { added: 1, changed: "two", removed: 0 },
      }),
    );

    expect(onRefresh).toHaveBeenCalledWith({
      reason: "targets",
      at: "2026-01-01T00:00:00.000Z",
      locale: "fr",
    });
  });

  it("drops a refresh payload that parses to a non-object or null instead of throwing", () => {
    const source = fakeEventSourceFactory();
    const onRefresh = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh,
    });

    expect(() => source.fire(0, "refresh", "null")).not.toThrow();
    expect(() => source.fire(0, "refresh", "42")).not.toThrow();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe("createReconnectController: shutdown", () => {
  it("on the shutdown event, marks the session expired and permanently stops reconnecting", () => {
    const source = fakeEventSourceFactory();
    const session = createSessionStore();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session,
      onRefresh: () => {},
    });

    source.fire(0, "shutdown");

    expect(session.getState()).toEqual({ kind: "session-expired" });
    expect(source.instances[0]?.closed).toBe(true);
    expect(source.instances).toHaveLength(1);
  });
});

describe("createReconnectController: error handling and readyState", () => {
  it("an error while readyState is not CLOSED is ignored (native retry continues)", () => {
    const source = fakeEventSourceFactory();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh: () => {},
    });

    source.setReadyState(0, EVENT_SOURCE_CONNECTING);
    source.fire(0, "error");

    expect(source.instances[0]?.closed).toBe(false);
    expect(source.instances).toHaveLength(1);
  });
});

describe("createReconnectController: 401 probe halts permanently", () => {
  it("a 401 probe raises the shared session-expired state and never constructs another EventSource", async () => {
    const source = fakeEventSourceFactory();
    const session = createSessionStore();
    const { probe } = fakeProbe(["unauthorized"]);
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe,
      session,
      onRefresh: () => {},
    });

    source.setReadyState(0, EVENT_SOURCE_CLOSED);
    source.fire(0, "error");
    await Promise.resolve();
    await Promise.resolve();

    expect(session.getState()).toEqual({ kind: "session-expired" });
    expect(source.instances).toHaveLength(1);
  });
});

describe("createReconnectController: backoff schedule", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("schedules reconnect attempts at 1s, 2s, 4s, capped at 30s, on repeated network-error probes", async () => {
    const source = fakeEventSourceFactory();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh: () => {},
    });

    async function disconnectAndCapture(index: number): Promise<number> {
      source.setReadyState(index, EVENT_SOURCE_CLOSED);
      source.fire(index, "error");
      await vi.advanceTimersByTimeAsync(0);
      const before = source.instances.length;
      return before;
    }

    await disconnectAndCapture(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(source.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(source.instances).toHaveLength(2);

    await disconnectAndCapture(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(source.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(source.instances).toHaveLength(3);

    await disconnectAndCapture(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(source.instances).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(source.instances).toHaveLength(4);
  });

  it("caps the backoff delay at 30 seconds however many attempts accumulate", async () => {
    const source = fakeEventSourceFactory();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      maxDelayMs: 30_000,
      onRefresh: () => {},
    });

    for (let i = 0; i < 5; i += 1) {
      const index = source.instances.length - 1;
      source.setReadyState(index, EVENT_SOURCE_CLOSED);
      source.fire(index, "error");
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);
    }

    const index = source.instances.length - 1;
    source.setReadyState(index, EVENT_SOURCE_CLOSED);
    source.fire(index, "error");
    await vi.advanceTimersByTimeAsync(0);
    const before = source.instances.length;

    await vi.advanceTimersByTimeAsync(29_999);
    expect(source.instances).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(source.instances).toHaveLength(before + 1);
  });

  it("a successful reconnect (open) resets the backoff so the next disconnect starts at the base delay again", async () => {
    const source = fakeEventSourceFactory();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: async () => "network-error",
      session: createSessionStore(),
      onRefresh: () => {},
    });

    source.setReadyState(0, EVENT_SOURCE_CLOSED);
    source.fire(0, "error");
    await vi.advanceTimersByTimeAsync(1000);
    expect(source.instances).toHaveLength(2);

    source.fire(1, "open");

    source.setReadyState(1, EVENT_SOURCE_CLOSED);
    source.fire(1, "error");
    await vi.advanceTimersByTimeAsync(999);
    expect(source.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(source.instances).toHaveLength(3);
  });
});

describe("createReconnectController: stop()", () => {
  it("closes the current connection and cancels a pending reconnect without touching session state", async () => {
    vi.useFakeTimers();
    try {
      const source = fakeEventSourceFactory();
      const session = createSessionStore();
      const controller = createReconnectController({
        url: "/events",
        createEventSource: source.createEventSource,
        probe: async () => "network-error",
        session,
        onRefresh: () => {},
      });

      source.setReadyState(0, EVENT_SOURCE_CLOSED);
      source.fire(0, "error");
      await vi.advanceTimersByTimeAsync(0);

      controller.stop();
      await vi.advanceTimersByTimeAsync(5000);

      expect(source.instances).toHaveLength(1);
      expect(source.instances[0]?.closed).toBe(true);
      expect(session.getState()).toEqual({ kind: "active" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a probe that resolves after stop() neither schedules a reconnect nor changes session state", async () => {
    let resolveProbe: ((outcome: "unauthorized" | "network-error") => void) | undefined;
    const probe = (): Promise<"unauthorized" | "network-error"> =>
      new Promise((resolve) => {
        resolveProbe = resolve;
      });
    const source = fakeEventSourceFactory();
    const session = createSessionStore();
    const controller = createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe,
      session,
      onRefresh: () => {},
    });

    source.setReadyState(0, EVENT_SOURCE_CLOSED);
    source.fire(0, "error");

    controller.stop();
    resolveProbe?.("unauthorized");
    await Promise.resolve();
    await Promise.resolve();

    expect(source.instances).toHaveLength(1);
    expect(session.getState()).toEqual({ kind: "active" });
  });
});

describe("createReconnectController: status changes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports live on open and reconnecting on a dropped connection", async () => {
    const source = fakeEventSourceFactory();
    const onStatusChange = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: fakeProbe(["network-error"]).probe,
      session: createSessionStore(),
      onRefresh: () => {},
      onStatusChange,
    });

    source.fire(0, "open");
    expect(onStatusChange).toHaveBeenLastCalledWith("live");

    source.setReadyState(0, EVENT_SOURCE_CLOSED);
    source.fire(0, "error");
    expect(onStatusChange).toHaveBeenLastCalledWith("reconnecting");
  });

  it("reports live again once a reconnect attempt opens", async () => {
    const source = fakeEventSourceFactory();
    const onStatusChange = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: fakeProbe(["network-error"]).probe,
      session: createSessionStore(),
      onRefresh: () => {},
      onStatusChange,
      baseDelayMs: 10,
    });

    source.fire(0, "open");
    source.setReadyState(0, EVENT_SOURCE_CLOSED);
    source.fire(0, "error");
    await vi.runAllTimersAsync();

    source.fire(1, "open");
    expect(onStatusChange).toHaveBeenLastCalledWith("live");
    expect(onStatusChange.mock.calls.map(([status]) => status)).toEqual([
      "live",
      "reconnecting",
      "live",
    ]);
  });

  it("never reports status without an observer wired", () => {
    const source = fakeEventSourceFactory();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: fakeProbe(["network-error"]).probe,
      session: createSessionStore(),
      onRefresh: () => {},
    });

    source.fire(0, "open");
    source.setReadyState(0, EVENT_SOURCE_CLOSED);
    source.fire(0, "error");
    expect(source.instances[0]?.closed).toBe(true);
  });
});

describe("createReconnectController: native-retry status", () => {
  it("reports reconnecting for an error during the EventSource's own retry, without closing it", () => {
    const source = fakeEventSourceFactory();
    const onStatusChange = vi.fn();
    createReconnectController({
      url: "/events",
      createEventSource: source.createEventSource,
      probe: fakeProbe(["network-error"]).probe,
      session: createSessionStore(),
      onRefresh: () => {},
      onStatusChange,
    });

    source.fire(0, "open");
    source.setReadyState(0, 0);
    source.fire(0, "error");

    expect(onStatusChange).toHaveBeenLastCalledWith("reconnecting");
    expect(source.instances[0]?.closed).toBe(false);

    source.fire(0, "open");
    expect(onStatusChange).toHaveBeenLastCalledWith("live");
  });
});
