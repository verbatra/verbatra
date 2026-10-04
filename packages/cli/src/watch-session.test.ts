import type { LockWaitEvent, WatchController } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import {
  captureStreams,
  flush,
  makeConfig,
  parseEnvelope,
  plainUi,
  recordingDeps,
} from "./test-support.js";
import type { WatchOptions } from "./watch-session.js";
import { runWatch } from "./watch-session.js";

function options(): WatchOptions {
  return { config: makeConfig(), cwd: "/proj", json: false };
}

describe("runWatch: stop handling", () => {
  let unhandled: unknown[];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
  });

  it("a clean stop resolves 0 and renders the stopping notice", async () => {
    const { streams, err } = captureStreams();
    const { deps } = recordingDeps({
      watch: async () => ({ stop: async () => {} }) satisfies WatchController,
    });

    const session = runWatch(options(), deps, plainUi(streams));
    await flush();
    session.requestStop();
    const code = await session.done;

    expect(code).toBe(0);
    expect(err()).toContain("stopping, finishing current run");
  });

  it("a rejected stop resolves 2, renders the error, and emits no unhandled rejection", async () => {
    const { streams, err } = captureStreams();
    const stopError = Object.assign(new Error("watcher close failed"), { code: "WATCH_CLOSE" });
    const { deps } = recordingDeps({
      watch: async () =>
        ({
          stop: async () => {
            throw stopError;
          },
        }) satisfies WatchController,
    });

    const session = runWatch(options(), deps, plainUi(streams));
    await flush();
    session.requestStop();
    const code = await session.done;
    await flush();

    expect(code).toBe(2);
    expect(err()).toContain("WATCH_CLOSE");
    expect(err()).toContain("watcher close failed");
    expect(unhandled).toEqual([]);
  });

  it("a stop requested during startup that then rejects resolves 2 and renders the error", async () => {
    const { streams, err } = captureStreams();
    const stopError = Object.assign(new Error("close after startup"), { code: "WATCH_CLOSE" });
    let resolveWatch!: (c: WatchController) => void;
    const { deps } = recordingDeps({
      watch: () =>
        new Promise<WatchController>((resolve) => {
          resolveWatch = resolve;
        }),
    });

    const session = runWatch(options(), deps, plainUi(streams));
    session.requestStop();
    resolveWatch({
      stop: async () => {
        throw stopError;
      },
    });
    const code = await session.done;
    await flush();

    expect(code).toBe(2);
    expect(err()).toContain("WATCH_CLOSE");
    expect(unhandled).toEqual([]);
  });

  it("a forced second stop resolves 130", async () => {
    const { streams } = captureStreams();
    const { deps } = recordingDeps({
      watch: async () => ({ stop: () => new Promise<void>(() => {}) }) satisfies WatchController,
    });

    const session = runWatch(options(), deps, plainUi(streams));
    await flush();
    session.requestStop();
    session.requestStop();
    const code = await session.done;

    expect(code).toBe(130);
  });
});

describe("runWatch: lock-wait progress and timeout threading", () => {
  const waitEvent: LockWaitEvent = {
    lockPath: "/proj/.verbatra-local/locks/de.lock",
    elapsedMs: 3_000,
    holder: { pid: 77, acquiredAt: "2026-07-18T00:00:00.000Z" },
  };
  const idleController = async (): Promise<WatchController> => ({ stop: async () => {} });

  it("threads lockAcquireTimeoutMs into the SDK watch input", async () => {
    const { streams } = captureStreams();
    const { deps, calls } = recordingDeps({ watch: idleController });

    runWatch({ ...options(), lockAcquireTimeoutMs: 5_000 }, deps, plainUi(streams));
    await flush();

    expect(calls.watch[0]?.lockAcquireTimeoutMs).toBe(5_000);
  });

  it("passes an onLockWait that renders the human waiting line to stderr", async () => {
    const { streams, err } = captureStreams();
    const { deps, calls } = recordingDeps({ watch: idleController });

    runWatch(options(), deps, plainUi(streams));
    await flush();
    calls.watch[0]?.onLockWait?.(waitEvent);

    expect(err()).toContain("waiting for the write lock");
    expect(err()).toContain("pid 77");
  });

  it("passes an onLockWait that emits a structured JSON record to stderr under --json", async () => {
    const { streams, err } = captureStreams();
    const { deps, calls } = recordingDeps({ watch: idleController });

    runWatch({ ...options(), json: true }, deps, plainUi(streams, true));
    await flush();
    calls.watch[0]?.onLockWait?.(waitEvent);

    const lines = err().trim().split("\n");
    const lastLine = lines.at(-1) ?? "";
    expect(JSON.parse(lastLine)).toMatchObject({ type: "lock-wait", holder: { pid: 77 } });
  });

  it("passes an onProgress that renders the human progress line to stderr", async () => {
    const { streams, err } = captureStreams();
    const { deps, calls } = recordingDeps({ watch: idleController });

    runWatch(options(), deps, plainUi(streams));
    await flush();
    calls.watch[0]?.onProgress?.({
      type: "locale-started",
      locale: "de",
      localeIndex: 0,
      totalLocales: 2,
    });

    expect(err()).toContain("translating de");
  });

  it("passes an onProgress that emits a structured JSON record to stderr under --json", async () => {
    const { streams, err } = captureStreams();
    const { deps, calls } = recordingDeps({ watch: idleController });

    runWatch({ ...options(), json: true }, deps, plainUi(streams, true));
    await flush();
    calls.watch[0]?.onProgress?.({ type: "run-finished", localesCompleted: 2, localesFailed: 0 });

    const lines = err().trim().split("\n");
    const lastLine = lines.at(-1) ?? "";
    expect(JSON.parse(lastLine)).toEqual({
      type: "run-finished",
      localesCompleted: 2,
      localesFailed: 0,
    });
  });
});

describe("runWatch: the --json error envelope for a session failure", () => {
  const jsonOptions = (): WatchOptions => ({ ...options(), json: true });

  it("emits one error envelope on stdout when the watcher fails to start", async () => {
    const { streams, out, err } = captureStreams();
    const startupError = Object.assign(new Error("no source"), { code: "SOURCE_UNREADABLE" });
    const { deps } = recordingDeps({
      watch: async () => {
        throw startupError;
      },
    });

    const session = runWatch(jsonOptions(), deps, plainUi(streams, true));
    const code = await session.done;

    expect(code).toBe(2);
    expect(parseEnvelope(out())).toMatchObject({
      ok: false,
      version: JSON_ENVELOPE_VERSION,
      command: "watch",
      code: "SOURCE_UNREADABLE",
      message: "no source",
    });
    expect(err()).toContain("SOURCE_UNREADABLE");
  });

  it("emits one error envelope on stdout when the watcher fails to stop", async () => {
    const { streams, out } = captureStreams();
    const { deps } = recordingDeps({
      watch: async () =>
        ({
          stop: async () => {
            throw Object.assign(new Error("watcher close failed"), { code: "WATCH_CLOSE" });
          },
        }) satisfies WatchController,
    });

    const session = runWatch(jsonOptions(), deps, plainUi(streams, true));
    await flush();
    session.requestStop();
    const code = await session.done;

    expect(code).toBe(2);
    expect(parseEnvelope(out())).toMatchObject({
      ok: false,
      command: "watch",
      code: "WATCH_CLOSE",
    });
  });

  it("writes no envelope without --json, leaving stdout empty", async () => {
    const { streams, out, err } = captureStreams();
    const { deps } = recordingDeps({
      watch: async () => {
        throw Object.assign(new Error("no source"), { code: "SOURCE_UNREADABLE" });
      },
    });

    const code = await runWatch(options(), deps, plainUi(streams)).done;

    expect(code).toBe(2);
    expect(out()).toBe("");
    expect(err()).toContain("SOURCE_UNREADABLE");
  });
});
