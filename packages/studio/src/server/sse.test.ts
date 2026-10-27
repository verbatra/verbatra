import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSseHub, type SseClientResponse } from "./sse.js";

const SK_PROJ = ["sk", "proj", ""].join("-");

interface FakeResponse extends SseClientResponse {
  writes: string[];
  ended: boolean;
  failWrites: boolean;
}

function fakeResponse(): EventEmitter & FakeResponse {
  const fake = new EventEmitter() as EventEmitter & FakeResponse;
  fake.writes = [];
  fake.ended = false;
  fake.failWrites = false;
  fake.write = (chunk: string): boolean => {
    if (fake.failWrites) {
      throw new Error("write to a destroyed socket");
    }
    fake.writes.push(chunk);
    return true;
  };
  fake.end = (): void => {
    fake.ended = true;
  };
  return fake;
}

describe("createSseHub: registration hygiene", () => {
  afterEach(() => vi.useRealTimers());

  it("deregisters a client the moment its response emits close", () => {
    const hub = createSseHub();
    const response = fakeResponse();
    hub.register(response);
    expect(hub.size).toBe(1);
    response.emit("close");
    expect(hub.size).toBe(0);
    hub.closeAll();
  });

  it("deregisters a client the moment its response emits error", () => {
    const hub = createSseHub();
    const response = fakeResponse();
    hub.register(response);
    expect(hub.size).toBe(1);
    response.emit("error", new Error("boom"));
    expect(hub.size).toBe(0);
    hub.closeAll();
  });

  it("registering two clients tracks both independently", () => {
    const hub = createSseHub();
    const first = fakeResponse();
    const second = fakeResponse();
    hub.register(first);
    hub.register(second);
    expect(hub.size).toBe(2);
    first.emit("close");
    expect(hub.size).toBe(1);
    hub.closeAll();
  });
});

describe("createSseHub: broadcast and heartbeat", () => {
  it("broadcastRefresh writes a refresh frame to every registered client", () => {
    const hub = createSseHub();
    const response = fakeResponse();
    hub.register(response);
    hub.broadcastRefresh({ reason: "source", at: "2026-01-01T00:00:00.000Z" });
    expect(response.writes).toHaveLength(1);
    expect(response.writes[0]).toContain("event: refresh");
    expect(response.writes[0]).toContain('"reason":"source"');
    hub.closeAll();
  });

  it("redacts a secret-shaped value before it reaches the wire (proves the redaction backstop runs on this path)", () => {
    const hub = createSseHub();
    const response = fakeResponse();
    hub.register(response);

    hub.broadcastRefresh({ reason: "source", at: `${SK_PROJ}Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z` });

    expect(response.writes[0]).not.toContain(`${SK_PROJ}Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z`);
    expect(response.writes[0]).toContain("[REDACTED]");
    hub.closeAll();
  });

  it("redacts a key that follows a JSON escape in the serialized frame", () => {
    const hub = createSseHub();
    const response = fakeResponse();
    hub.register(response);
    const key = `${SK_PROJ}Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z`;

    hub.broadcastRefresh({ reason: "source", at: `line\n${key}` });

    expect(response.writes[0]).not.toContain(key);
    expect(response.writes[0]).toContain("line\\n[REDACTED]");
    hub.closeAll();
  });

  it("a broadcast write failure deregisters the client instead of throwing", () => {
    const hub = createSseHub();
    const response = fakeResponse();
    hub.register(response);
    response.failWrites = true;
    expect(() =>
      hub.broadcastRefresh({ reason: "lock", at: "2026-01-01T00:00:00.000Z" }),
    ).not.toThrow();
    expect(hub.size).toBe(0);
    hub.closeAll();
  });

  it("a heartbeat tick writes only to registered clients, on the injected interval", async () => {
    vi.useFakeTimers();
    const hub = createSseHub({ heartbeatIntervalMs: 10 });
    const response = fakeResponse();
    hub.register(response);
    await vi.advanceTimersByTimeAsync(10);
    expect(response.writes).toHaveLength(1);
    expect(response.writes[0]).toMatch(/^: heartbeat/);
    await vi.advanceTimersByTimeAsync(10);
    expect(response.writes).toHaveLength(2);
    hub.closeAll();
    vi.useRealTimers();
  });

  it("a heartbeat write to a destroyed socket deregisters the client with no uncaught exception or unhandled rejection", async () => {
    const uncaught = vi.fn();
    const unhandled = vi.fn();
    process.on("uncaughtException", uncaught);
    process.on("unhandledRejection", unhandled);
    try {
      vi.useFakeTimers();
      const hub = createSseHub({ heartbeatIntervalMs: 10 });
      const response = fakeResponse();
      hub.register(response);
      response.failWrites = true;

      await vi.advanceTimersByTimeAsync(10);

      expect(hub.size).toBe(0);
      expect(uncaught).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      hub.closeAll();
      vi.useRealTimers();
    } finally {
      process.off("uncaughtException", uncaught);
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("createSseHub: shutdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("closeAll writes a final shutdown frame to every client, ends each response, and stops the heartbeat", () => {
    const hub = createSseHub({ heartbeatIntervalMs: 10 });
    const response = fakeResponse();
    hub.register(response);

    hub.closeAll();

    expect(response.writes.at(-1)).toContain("event: shutdown");
    expect(response.ended).toBe(true);
    expect(hub.size).toBe(0);

    response.writes.length = 0;
    return vi.advanceTimersByTimeAsync(100).then(() => {
      expect(response.writes).toHaveLength(0);
    });
  });

  it("closeAll never throws even when ending an already-destroyed response", () => {
    const hub = createSseHub();
    const response = fakeResponse();
    hub.register(response);
    response.failWrites = true;
    response.end = () => {
      throw new Error("already destroyed");
    };
    expect(() => hub.closeAll()).not.toThrow();
  });
});
