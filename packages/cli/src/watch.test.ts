import {
  SdkError,
  type WatchController,
  type WatchInput,
  type WatchRunResult,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run } from "./run.js";
import {
  captureStreams,
  flush,
  makeSummary,
  parseEnvelope,
  recordingDeps,
} from "./test-support.js";
import type { Session } from "./types.js";

function watchHarness() {
  let onRun: ((result: WatchRunResult) => void) | undefined;
  let resolveStop: (() => void) | undefined;
  let stopCalls = 0;
  const watch = (input: WatchInput): Promise<WatchController> => {
    onRun = input.onRun;
    return Promise.resolve({
      stop: () => {
        stopCalls += 1;
        return new Promise<void>((resolve) => {
          resolveStop = resolve;
        });
      },
    });
  };
  return {
    watch,
    fire: (result: WatchRunResult) => onRun?.(result),
    finishStop: () => resolveStop?.(),
    get stopCalls(): number {
      return stopCalls;
    },
  };
}

async function startWatch(
  argv: readonly string[],
  deps: Parameters<typeof run>[1],
  streams: Parameters<typeof run>[2],
): Promise<{ done: Promise<number>; session: Session }> {
  let session: Session | undefined;
  const done = run(argv, deps, streams, {
    onWatchSession: (s) => {
      session = s;
    },
  });
  await flush();
  if (session === undefined) {
    throw new Error("watch session was not started");
  }
  return { done, session };
}

describe("run watch: wiring and rendering", () => {
  it("calls SDK watch() with config + onRun, prints a startup line to stderr, and stays alive", async () => {
    const h = watchHarness();
    const { deps, calls } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();

    const { done, session } = await startWatch(["watch", "--cwd", "/p"], deps, cap.streams);
    let settled = false;
    void done.then(() => {
      settled = true;
    });
    await flush();

    expect(calls.watch[0]?.cwd).toBe("/p");
    expect(typeof calls.watch[0]?.onRun).toBe("function");
    expect(cap.err()).toContain("watching en");
    expect(settled).toBe(false);

    session.requestStop();
    h.finishStop();
    expect(await done).toBe(0);
  });

  it("renders each run human-readably on stdout", async () => {
    const h = watchHarness();
    const { deps } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch"], deps, cap.streams);

    h.fire({ status: "succeeded", summary: makeSummary({ succeeded: ["de"] }) });
    expect(cap.out()).toContain("1 succeeded, 0 partial, 0 failed");

    session.requestStop();
    h.finishStop();
    await done;
  });

  it("--json emits one envelope record per run on stdout, ok mirroring the run status", async () => {
    const h = watchHarness();
    const { deps } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch", "--json"], deps, cap.streams);

    h.fire({ status: "succeeded", summary: makeSummary({ succeeded: ["de"] }) });
    h.fire({ status: "failed", error: { code: "SOURCE_INVALID", message: "x" } });

    const lines = cap.out().trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(parseEnvelope(lines[0] ?? "")).toMatchObject({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "watch",
    });
    expect(parseEnvelope(lines[1] ?? "")).toEqual({
      ok: false,
      version: JSON_ENVELOPE_VERSION,
      command: "watch",
      code: "SOURCE_INVALID",
      message: "x",
    });

    session.requestStop();
    h.finishStop();
    await done;
  });

  it("a failing run is rendered and watching continues (no exit; a later run still renders)", async () => {
    const h = watchHarness();
    const { deps } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch"], deps, cap.streams);

    h.fire({ status: "failed", error: { code: "SOURCE_INVALID", message: "bad" } });
    let settled = false;
    void done.then(() => {
      settled = true;
    });
    await flush();
    expect(cap.out()).toContain("[SOURCE_INVALID] bad");
    expect(settled).toBe(false);

    h.fire({ status: "succeeded", summary: makeSummary({ succeeded: ["de"] }) });
    expect(cap.out()).toContain("1 succeeded");

    session.requestStop();
    h.finishStop();
    await done;
  });

  it("--debounce is parsed and passed through to watch()", async () => {
    const h = watchHarness();
    const { deps, calls } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch", "--debounce", "50"], deps, cap.streams);

    expect(calls.watch[0]?.debounceMs).toBe(50);

    session.requestStop();
    h.finishStop();
    await done;
  });

  it("omitting --debounce leaves debounceMs unset (watch() applies its own 300ms default)", async () => {
    const h = watchHarness();
    const { deps, calls } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch"], deps, cap.streams);

    expect(calls.watch[0]).not.toHaveProperty("debounceMs");

    session.requestStop();
    h.finishStop();
    await done;
  });
});

describe("run watch: --debounce validation", () => {
  it.each(["abc", "0", "-5", "250ms", "3.5", "60001"])(
    "rejects an invalid --debounce %s as a usage error: exit 2, structured stderr, no SDK call",
    async (value) => {
      const { deps, calls } = recordingDeps();
      const cap = captureStreams();

      const code = await run(["watch", "--debounce", value], deps, cap.streams, {
        onWatchSession: () => {},
      });

      expect(code).toBe(2);
      expect(cap.err()).toContain("[INVALID_DEBOUNCE]");
      expect(cap.out()).toBe("");
      expect(calls.loadConfig).toHaveLength(0);
      expect(calls.watch).toHaveLength(0);
    },
  );

  it("accepts a --debounce exactly at the maximum", async () => {
    const h = watchHarness();
    const { deps, calls } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch", "--debounce", "60000"], deps, cap.streams);

    expect(calls.watch[0]?.debounceMs).toBe(60_000);

    session.requestStop();
    h.finishStop();
    await done;
  });
});

describe("run watch: --concurrency", () => {
  it("is parsed and passed through to watch() as a number", async () => {
    const h = watchHarness();
    const { deps, calls } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch", "--concurrency", "3"], deps, cap.streams);

    expect(calls.watch[0]?.concurrency).toBe(3);

    session.requestStop();
    h.finishStop();
    await done;
  });

  it("omitting --concurrency leaves it unset (watch() applies its serial default of 1)", async () => {
    const h = watchHarness();
    const { deps, calls } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch"], deps, cap.streams);

    expect(calls.watch[0]).not.toHaveProperty("concurrency");

    session.requestStop();
    h.finishStop();
    await done;
  });

  it.each(["abc", "0", "-5", "2.5", "3ms", "101"])(
    "rejects an invalid --concurrency %s as a usage error: exit 2, structured stderr, no SDK call",
    async (value) => {
      const { deps, calls } = recordingDeps();
      const cap = captureStreams();

      const code = await run(["watch", "--concurrency", value], deps, cap.streams, {
        onWatchSession: () => {},
      });

      expect(code).toBe(2);
      expect(cap.err()).toContain("[INVALID_CONCURRENCY]");
      expect(cap.out()).toBe("");
      expect(calls.loadConfig).toHaveLength(0);
      expect(calls.watch).toHaveLength(0);
    },
  );

  it("accepts a --concurrency exactly at the maximum", async () => {
    const h = watchHarness();
    const { deps, calls } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(
      ["watch", "--concurrency", "100"],
      deps,
      cap.streams,
    );

    expect(calls.watch[0]?.concurrency).toBe(100);

    session.requestStop();
    h.finishStop();
    await done;
  });
});

describe("run watch: shutdown and exit codes", () => {
  it("a clean stop via SIGINT awaits stop() and exits 0", async () => {
    const h = watchHarness();
    const { deps } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch"], deps, cap.streams);

    session.requestStop();
    expect(cap.err()).toContain("stopping, finishing current run");
    let settled = false;
    void done.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    h.finishStop();
    expect(await done).toBe(0);
    expect(h.stopCalls).toBe(1);
  });

  it("a second SIGINT during a graceful stop forces exit 130", async () => {
    const h = watchHarness();
    const { deps } = recordingDeps({ watch: h.watch });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch"], deps, cap.streams);

    session.requestStop();
    session.requestStop();
    expect(await done).toBe(130);
  });

  it("a startup failure (watch throws) exits 2 with the structured error on stderr", async () => {
    const { deps } = recordingDeps({
      watch: () => Promise.reject(new SdkError("SOURCE_UNREADABLE", "missing source")),
    });
    const cap = captureStreams();
    const { done, session } = await startWatch(["watch"], deps, cap.streams);

    expect(await done).toBe(2);
    expect(cap.err()).toContain("[SOURCE_UNREADABLE] missing source");
    expect(() => session.requestStop()).not.toThrow();
  });

  it("a loadConfig failure before watching exits 2 with the structured error", async () => {
    const { deps } = recordingDeps({
      loadConfig: () => Promise.reject(new SdkError("CONFIG_INVALID", "bad config")),
    });
    const cap = captureStreams();

    const code = await run(["watch"], deps, cap.streams, { onWatchSession: () => {} });

    expect(code).toBe(2);
    expect(cap.err()).toContain("[CONFIG_INVALID] bad config");
  });

  it("a stop requested during startup is honored once the watcher is ready -> 0", async () => {
    let resolveWatch!: (controller: WatchController) => void;
    let resolveStop!: () => void;
    const { deps } = recordingDeps({
      watch: () =>
        new Promise<WatchController>((resolve) => {
          resolveWatch = resolve;
        }),
    });
    const cap = captureStreams();
    let session: Session | undefined;
    const done = run(["watch"], deps, cap.streams, {
      onWatchSession: (s) => {
        session = s;
      },
    });
    await flush();

    session?.requestStop();
    resolveWatch({
      stop: () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        }),
    });
    await flush();
    resolveStop();

    expect(await done).toBe(0);
  });
});
