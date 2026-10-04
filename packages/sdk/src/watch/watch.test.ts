import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHint } from "../error-hints.js";
import { SdkError } from "../errors.js";
import type { RunSummary } from "../flow/summary.js";
import type { TranslateInput } from "../flow/translate-project.js";
import { baseConfig, makeFakeFs } from "../test-support.js";
import { type CreateWatcher, type RunTranslate, type WatchRunResult, watch } from "./watch.js";

const CWD = "/proj";
const SOURCE = resolve(CWD, "locales/en.json");

const okFs = makeFakeFs({ fileExists: async () => true });

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "watch-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    await Promise.resolve();
  }
}

function watcherHarness() {
  let listener: (() => void) | undefined;
  let capturedPaths: readonly string[] = [];
  let closed = false;
  const createWatcher: CreateWatcher = (paths) => {
    capturedPaths = paths;
    return {
      onChange: (l) => {
        listener = l;
      },
      close: async () => {
        closed = true;
      },
    };
  };
  return {
    createWatcher,
    emit: () => listener?.(),
    get paths() {
      return capturedPaths;
    },
    get closed() {
      return closed;
    },
  };
}

function runHarness() {
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const inputs: TranslateInput[] = [];
  const summary: RunSummary = {
    dryRun: false,
    locales: [],
    succeeded: [],
    partial: [],
    failed: [],
  };
  let blocker: Promise<void> | undefined;
  let releaseFn: (() => void) | undefined;
  let nextThrow: unknown;
  const run: RunTranslate = async (input) => {
    calls += 1;
    inputs.push(input);
    active += 1;
    maxActive = Math.max(maxActive, active);
    const held = blocker;
    try {
      if (held !== undefined) {
        await held;
      }
      if (nextThrow !== undefined) {
        const toThrow = nextThrow;
        nextThrow = undefined;
        throw toThrow;
      }
      return summary;
    } finally {
      active -= 1;
    }
  };
  return {
    run,
    summary,
    inputs,
    block: () => {
      blocker = new Promise<void>((r) => {
        releaseFn = r;
      });
    },
    release: () => {
      const r = releaseFn;
      blocker = undefined;
      releaseFn = undefined;
      r?.();
    },
    throwNext: (error: unknown) => {
      nextThrow = error;
    },
    get calls() {
      return calls;
    },
    get maxActive() {
      return maxActive;
    },
  };
}

describe("watch: startup and wiring", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("watches ONLY the configured source path, not targets or a broad tree", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await watch(
      { config: baseConfig({ targetLocales: ["de", "fr"] }), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    expect(w.paths).toEqual([SOURCE]);
  });

  it("performs exactly one initial run on startup, before any event", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    expect(r.calls).toBe(1);
  });

  it("invokes the one-shot translate with the config and cwd, never dry-run", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const config = baseConfig();
    await watch(
      { config, cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(r.inputs[0]).toEqual({ config, cwd: CWD });
    expect((r.inputs[0] as { dryRun?: boolean }).dryRun).toBeUndefined();
  });

  it("threads onLockWait and lockAcquireTimeoutMs through to each run's translate input", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const onLockWait = (): void => {};
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {}, onLockWait, lockAcquireTimeoutMs: 1_234 },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(r.inputs[0]?.onLockWait).toBe(onLockWait);
    expect(r.inputs[0]?.lockAcquireTimeoutMs).toBe(1_234);
  });

  it("a missing source path at startup is a hard SOURCE_UNREADABLE error, no watcher or run", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const missingFs = makeFakeFs({ fileExists: async () => false });
    await expect(
      watch(
        { config: baseConfig(), cwd: CWD, onRun: () => {} },
        { fs: missingFs, createWatcher: w.createWatcher, runTranslate: r.run },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
    expect(r.calls).toBe(0);
    expect(w.paths).toEqual([]);
  });

  it("a provider that cannot be constructed at startup is a hard PROVIDER_CONSTRUCTION_FAILED error, no watcher or run", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const w = watcherHarness();
    const r = runHarness();
    const ready = vi.fn();
    const failure = watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {}, onReady: ready },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await expect(failure).rejects.toBeInstanceOf(SdkError);
    await expect(failure).rejects.toMatchObject({
      code: "PROVIDER_CONSTRUCTION_FAILED",
      cause: { code: "MISSING_API_KEY" },
    });
    expect(r.calls).toBe(0);
    expect(w.paths).toEqual([]);
    expect(ready).not.toHaveBeenCalled();
  });

  it("constructs the provider at startup through the injected factory", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const w = watcherHarness();
    const r = runHarness();
    const createProvider = vi.fn(() => {
      throw new Error("factory refused");
    });
    await expect(
      watch(
        { config: baseConfig(), cwd: CWD, onRun: () => {} },
        { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run, createProvider },
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_CONSTRUCTION_FAILED" });
    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(r.calls).toBe(0);
  });

  it("constructs no provider under provider none, so a missing key never stops the session", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const w = watcherHarness();
    const r = runHarness();
    const createProvider = vi.fn();
    const controller = await watch(
      { config: baseConfig({ provider: { id: "none", options: {} } }), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run, createProvider },
    );
    await settle();
    expect(createProvider).not.toHaveBeenCalled();
    expect(r.calls).toBe(1);
    await controller.stop();
  });

  it("calls onReady once, after the watcher is attached and before the initial run starts", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const seen: string[] = [];
    await watch(
      {
        config: baseConfig(),
        cwd: CWD,
        onRun: () => seen.push("run"),
        onReady: () => seen.push(`ready:${w.paths.length}:${r.calls}`),
      },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(seen).toEqual(["ready:1:0", "run"]);
  });

  it("does not call onReady when a startup check refuses the session", async () => {
    const onReady = vi.fn();
    await expect(
      watch(
        { config: baseConfig(), cwd: CWD, onRun: () => {}, onReady },
        { fs: makeFakeFs({ fileExists: async () => false }), runTranslate: runHarness().run },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
    expect(onReady).not.toHaveBeenCalled();
  });

  it("lets a watcher-factory failure escape unwrapped at startup, with no run started", async () => {
    const r = runHarness();
    const failing: CreateWatcher = () => {
      throw new Error("no watcher could be built");
    };
    const rejection = await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: failing, runTranslate: r.run },
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).not.toBeInstanceOf(SdkError);
    expect(r.calls).toBe(0);
  });

  it("refuses concurrency greater than 1 with a token budget at startup, before any watcher", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await expect(
      watch(
        { config: baseConfig({ maxTokens: 1_000 }), cwd: CWD, concurrency: 2, onRun: () => {} },
        { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
      ),
    ).rejects.toMatchObject({ code: "CONCURRENCY_BUDGET_CONFLICT" });
    expect(r.calls).toBe(0);
    expect(w.paths).toEqual([]);
  });

  it("offers no dry run as a way out of the budget conflict, since watch has none", async () => {
    const rejection = await watch(
      { config: baseConfig({ maxTokens: 1_000 }), cwd: CWD, concurrency: 2, onRun: () => {} },
      { fs: okFs, createWatcher: watcherHarness().createWatcher, runTranslate: runHarness().run },
    ).catch((error: unknown) => error);
    expect((rejection as SdkError).message).toContain("Set concurrency to 1 or remove maxTokens.");
    expect((rejection as SdkError).message).not.toContain("--dry-run");
  });

  it("refuses a concurrency that is not an integer of at least 1 at startup", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await expect(
      watch(
        { config: baseConfig(), cwd: CWD, concurrency: 0, onRun: () => {} },
        { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
      ),
    ).rejects.toMatchObject({ code: "CONCURRENCY_INVALID" });
    expect(r.calls).toBe(0);
    expect(w.paths).toEqual([]);
  });

  it.each([[-1], [0.5], [Number.NaN]])(
    "refuses a lockAcquireTimeoutMs of %s at startup",
    async (lockAcquireTimeoutMs) => {
      const w = watcherHarness();
      const r = runHarness();
      await expect(
        watch(
          { config: baseConfig(), cwd: CWD, lockAcquireTimeoutMs, onRun: () => {} },
          { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
        ),
      ).rejects.toMatchObject({ code: "LOCK_TIMEOUT_INVALID" });
      expect(r.calls).toBe(0);
      expect(w.paths).toEqual([]);
    },
  );

  it("passes a locale subset through to every run", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const controller = await watch(
      {
        config: baseConfig({ targetLocales: ["de", "fr"] }),
        cwd: CWD,
        locales: ["fr"],
        onRun: () => {},
      },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    await controller.stop();

    expect(r.inputs[0]?.locales).toEqual(["fr"]);
  });

  it("omits locales entirely when no subset is asked for", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const controller = await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    await controller.stop();

    expect(r.inputs[0]).not.toHaveProperty("locales");
  });

  it("refuses an unconfigured locale at startup, before any watching begins", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await expect(
      watch(
        {
          config: baseConfig({ targetLocales: ["de"] }),
          cwd: CWD,
          locales: ["zz"],
          onRun: () => {},
        },
        { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
    expect(r.calls).toBe(0);
    expect(w.paths).toEqual([]);
  });

  it("reports the concurrency conflict ahead of a missing source", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const missingFs = makeFakeFs({ fileExists: async () => false });
    await expect(
      watch(
        { config: baseConfig({ maxTokens: 1_000 }), cwd: CWD, concurrency: 2, onRun: () => {} },
        { fs: missingFs, createWatcher: w.createWatcher, runTranslate: r.run },
      ),
    ).rejects.toMatchObject({ code: "CONCURRENCY_BUDGET_CONFLICT" });
  });

  it("starts normally for concurrency greater than 1 without a budget", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await watch(
      { config: baseConfig(), cwd: CWD, concurrency: 3, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(r.inputs[0]?.concurrency).toBe(3);
    expect(w.paths).toEqual([SOURCE]);
  });

  it("starts normally for a budget at the default serial concurrency", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await watch(
      { config: baseConfig({ maxTokens: 1_000 }), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(r.calls).toBe(1);
    expect(w.paths).toEqual([SOURCE]);
  });

  it("surfaces each run's summary through onRun, not swallowed", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const results: WatchRunResult[] = [];
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: (x) => results.push(x) },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(results[0]).toEqual({ status: "succeeded", summary: r.summary });
  });
});

describe("watch: debounce + serialization state machine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("defaults cwd to process.cwd() when none is given", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await watch(
      { config: baseConfig(), onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    expect(w.paths).toEqual([resolve(process.cwd(), "locales/en.json")]);
  });

  it("honors a custom debounceMs interval", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await watch(
      { config: baseConfig(), cwd: CWD, debounceMs: 50, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    w.emit();
    await vi.advanceTimersByTimeAsync(49);
    expect(r.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(r.calls).toBe(2);
  });

  it("a burst of events triggers exactly ONE run after the debounce window", async () => {
    const w = watcherHarness();
    const r = runHarness();
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    w.emit();
    w.emit();
    w.emit();
    expect(r.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(r.calls).toBe(2);
  });

  it("a change DURING a run does not start a concurrent run; exactly one follow-up after", async () => {
    const w = watcherHarness();
    const r = runHarness();
    r.block();
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    w.emit();
    await vi.advanceTimersByTimeAsync(300);
    expect(r.calls).toBe(1);
    r.release();
    await settle();
    expect(r.calls).toBe(2);
    expect(r.maxActive).toBe(1);
  });

  it("MANY changes during a run collapse into a single follow-up", async () => {
    const w = watcherHarness();
    const r = runHarness();
    r.block();
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    for (let i = 0; i < 5; i += 1) {
      w.emit();
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(r.calls).toBe(1);
    r.release();
    await settle();
    expect(r.calls).toBe(2);
    expect(r.maxActive).toBe(1);
  });

  it("the follow-up starts IMMEDIATELY on completion with no added debounce delay", async () => {
    const w = watcherHarness();
    const r = runHarness();
    r.block();
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    w.emit();
    await vi.advanceTimersByTimeAsync(300);
    r.release();
    await settle();
    expect(r.calls).toBe(2);
  });

  it("a debounce timer pending when the run completes fires against the idle machine: one run, not dropped or doubled", async () => {
    const w = watcherHarness();
    const r = runHarness();
    r.block();
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    w.emit();
    expect(r.calls).toBe(1);
    r.release();
    await settle();
    expect(r.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(r.calls).toBe(2);
    expect(r.maxActive).toBe(1);
  });
});

describe("watch: failure handling and shutdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a failing run is reported and watching CONTINUES (SdkError code surfaced)", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const results: WatchRunResult[] = [];
    r.throwNext(new SdkError("SOURCE_INVALID", "bad source"));
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: (x) => results.push(x) },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(results[0]).toEqual({
      status: "failed",
      error: {
        code: "SOURCE_INVALID",
        message: "bad source",
        hint: errorHint(new SdkError("SOURCE_INVALID", "bad source")),
      },
    });
    w.emit();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(r.calls).toBe(2);
    expect(results[1]?.status).toBe("succeeded");
  });

  it("a failing run that wraps a coded error carries the cause code and the wrapping hint", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const results: WatchRunResult[] = [];
    const cause = Object.assign(new Error("no key"), { code: "MISSING_API_KEY" });
    const failure = new SdkError("PROVIDER_CONSTRUCTION_FAILED", "no provider", { cause });
    r.throwNext(failure);
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: (x) => results.push(x) },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(results[0]).toEqual({
      status: "failed",
      error: {
        code: "PROVIDER_CONSTRUCTION_FAILED",
        message: "no provider",
        causeCode: "MISSING_API_KEY",
        hint: errorHint(failure),
      },
    });
  });

  it("a non-coded Error and a non-Error throw both surface a fallback code", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const results: WatchRunResult[] = [];
    r.throwNext(new Error("boom"));
    await watch(
      { config: baseConfig(), cwd: CWD, onRun: (x) => results.push(x) },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    expect(results[0]).toEqual({
      status: "failed",
      error: { code: "WATCH_RUN_FAILED", message: "boom" },
    });
    r.throwNext("weird");
    w.emit();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(results[1]).toEqual({
      status: "failed",
      error: { code: "WATCH_RUN_FAILED", message: "weird" },
    });
  });

  it("stop() during a run: no new triggers, no follow-up, awaits the in-flight run, closes the watcher", async () => {
    const w = watcherHarness();
    const r = runHarness();
    r.block();
    const controller = await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    w.emit();
    await vi.advanceTimersByTimeAsync(300);

    const stopped = controller.stop();
    w.emit();
    await vi.advanceTimersByTimeAsync(300);
    r.release();
    await stopped;

    expect(r.calls).toBe(1);
    expect(w.closed).toBe(true);
  });

  it("stop() while a debounce timer is pending clears it: the edit triggers no run", async () => {
    const w = watcherHarness();
    const r = runHarness();
    const controller = await watch(
      { config: baseConfig(), cwd: CWD, onRun: () => {} },
      { fs: okFs, createWatcher: w.createWatcher, runTranslate: r.run },
    );
    await settle();
    w.emit();
    await controller.stop();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(r.calls).toBe(1);
    expect(w.closed).toBe(true);
  });
});
