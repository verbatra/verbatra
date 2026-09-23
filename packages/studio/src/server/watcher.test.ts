import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { LocaleFileSnapshot, SdkFs, VerbatraConfig } from "@verbatra/sdk";
import { LOCK_FILE_NAME, PROVENANCE_FILE_NAME } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefreshEvent } from "../shared/sse-events.js";
import { baseStudioConfig } from "./test-support.js";
import type { CreateStudioWatcher, StudioWatcher } from "./types.js";
import { createProjectWatcher, defaultCreateStudioWatcher } from "./watcher.js";

const PROJECT_ROOT = "/proj";

function multiWatcherHarness() {
  const calls: { paths: readonly string[]; listener?: () => void; closed: boolean }[] = [];
  const createWatcher: CreateStudioWatcher = (paths): StudioWatcher => {
    const call: { paths: readonly string[]; listener?: () => void; closed: boolean } = {
      paths,
      closed: false,
    };
    calls.push(call);
    return {
      onChange: (listener) => {
        call.listener = listener;
      },
      close: async () => {
        call.closed = true;
      },
    };
  };
  return {
    createWatcher,
    calls,
    emit(index: number): void {
      calls[index]?.listener?.();
    },
  };
}

function collectRefresh(): { events: RefreshEvent[]; listener: (event: RefreshEvent) => void } {
  const events: RefreshEvent[] = [];
  return { events, listener: (event) => events.push(event) };
}

function snapshot(
  locale: string,
  entries: Readonly<Record<string, string>> = {},
): LocaleFileSnapshot {
  return { locale, hashes: new Map(Object.entries(entries)) };
}

function emptyReadLocaleSnapshot(locale: string): Promise<LocaleFileSnapshot> {
  return Promise.resolve(snapshot(locale));
}

function unknownFileIdentity(): Promise<string | undefined> {
  return Promise.resolve(undefined);
}

function sequencedFileIdentity(
  tokens: readonly (string | undefined)[],
): () => Promise<string | undefined> {
  let index = 0;
  return () => {
    const token = tokens[Math.min(index, tokens.length - 1)];
    index += 1;
    return Promise.resolve(token);
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    await Promise.resolve();
  }
}

function sequencedReadLocaleSnapshot(
  sequences: Readonly<Record<string, readonly LocaleFileSnapshot[]>>,
): (locale: string) => Promise<LocaleFileSnapshot> {
  const cursors = new Map<string, number>();
  return async (locale) => {
    const sequence = sequences[locale] ?? [];
    const index = cursors.get(locale) ?? 0;
    cursors.set(locale, index + 1);
    const next = sequence[Math.min(index, sequence.length - 1)];
    if (next === undefined) {
      throw new Error(`no snapshot configured for locale "${locale}"`);
    }
    return next;
  };
}

describe("createProjectWatcher: category wiring", () => {
  it("watches the source file, every target locale file as its own call, the lock file, and the provenance file", async () => {
    const harness = multiWatcherHarness();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de", "fr"] });
    await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT },
      { createWatcher: harness.createWatcher, readLocaleSnapshot: emptyReadLocaleSnapshot },
    );
    expect(harness.calls).toHaveLength(5);
    expect(harness.calls[0]?.paths).toEqual([join(PROJECT_ROOT, "locales/en.json")]);
    expect(harness.calls[1]?.paths).toEqual([join(PROJECT_ROOT, "locales/de.json")]);
    expect(harness.calls[2]?.paths).toEqual([join(PROJECT_ROOT, "locales/fr.json")]);
    expect(harness.calls[3]?.paths).toEqual([join(PROJECT_ROOT, LOCK_FILE_NAME)]);
    expect(harness.calls[4]?.paths).toEqual([join(PROJECT_ROOT, PROVENANCE_FILE_NAME)]);
  });

  it("creates no targets watcher when no target locales are configured", async () => {
    const harness = multiWatcherHarness();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: [] });
    await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT },
      { createWatcher: harness.createWatcher, readLocaleSnapshot: emptyReadLocaleSnapshot },
    );
    expect(harness.calls).toHaveLength(3);
    expect(harness.calls[0]?.paths).toEqual([join(PROJECT_ROOT, "locales/en.json")]);
    expect(harness.calls[1]?.paths).toEqual([join(PROJECT_ROOT, LOCK_FILE_NAME)]);
    expect(harness.calls[2]?.paths).toEqual([join(PROJECT_ROOT, PROVENANCE_FILE_NAME)]);
  });

  it("never emits a refresh event until a raw change is seen", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT },
      { createWatcher: harness.createWatcher, readLocaleSnapshot: emptyReadLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);
    expect(refresh.events).toEqual([]);
  });
});

describe("createProjectWatcher: debounce and coalescing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a burst of raw events on one locale collapses into exactly one refresh after the debounce window", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot: emptyReadLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    harness.emit(1);
    harness.emit(1);
    expect(refresh.events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(49);
    expect(refresh.events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(refresh.events).toHaveLength(1);
    expect(refresh.events[0]).toEqual({
      reason: "targets",
      at: expect.any(String),
      locale: "de",
      delta: { added: 0, changed: 0, removed: 0 },
    });
  });

  it("simultaneous changes in two different categories raise two distinct, correctly tagged events", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      {
        createWatcher: harness.createWatcher,
        readLocaleSnapshot: emptyReadLocaleSnapshot,
        readFileIdentity: unknownFileIdentity,
      },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(0);
    harness.emit(2);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(2);
    expect(refresh.events.map((event) => event.reason).sort()).toEqual(["lock", "source"]);
    const lockEvent = refresh.events.find((event) => event.reason === "lock");
    expect(lockEvent).toEqual({ reason: "lock", at: expect.any(String) });
  });

  it("a second burst after the first settles raises a second, independent refresh", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot: emptyReadLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(0);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    expect(refresh.events).toHaveLength(1);

    harness.emit(0);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    expect(refresh.events).toHaveLength(2);
  });
});

describe("createProjectWatcher: duplicate-state suppression", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function lockWatcher(
    harness: ReturnType<typeof multiWatcherHarness>,
    readFileIdentity: () => Promise<string | undefined>,
  ): Promise<{ events: RefreshEvent[] }> {
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: [] });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      {
        createWatcher: harness.createWatcher,
        readLocaleSnapshot: emptyReadLocaleSnapshot,
        readFileIdentity,
      },
    );
    watcher.onRefresh(refresh.listener);
    return refresh;
  }

  it("publishes one lock refresh for two raw events that straddle separate debounce windows over one unchanged file", async () => {
    const harness = multiWatcherHarness();
    const refresh = await lockWatcher(harness, sequencedFileIdentity(["4711:64:1700.5"]));

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toEqual([{ reason: "lock", at: expect.any(String) }]);
  });

  it("publishes a second lock refresh once the lock file's identity actually changes", async () => {
    const harness = multiWatcherHarness();
    const refresh = await lockWatcher(
      harness,
      sequencedFileIdentity(["4711:64:1700.5", "4712:70:1900.5"]),
    );

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(2);
    expect(refresh.events.every((event) => event.reason === "lock")).toBe(true);
  });

  it("fails open and publishes both refreshes when the lock file's identity cannot be read", async () => {
    const harness = multiWatcherHarness();
    const refresh = await lockWatcher(harness, sequencedFileIdentity([undefined]));

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(2);
  });

  it("fails open and publishes both refreshes when the identity read itself rejects", async () => {
    const harness = multiWatcherHarness();
    const refresh = await lockWatcher(harness, () => Promise.reject(new Error("stat exploded")));

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(2);
  });

  it("never suppresses a locale refresh: a snapshot-tracked entry reports its own delta and is not identity-gated", async () => {
    const harness = multiWatcherHarness();
    const refresh = await lockWatcher(harness, sequencedFileIdentity(["4711:64:1700.5"]));

    harness.emit(0);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    harness.emit(0);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(2);
    expect(refresh.events.every((event) => event.reason === "source")).toBe(true);
  });
});

describe("createProjectWatcher: per-locale key delta", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports a newly added key in a single target locale as a nonzero added count", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const readLocaleSnapshot = sequencedReadLocaleSnapshot({
      en: [snapshot("en")],
      de: [snapshot("de", { a: "h1" }), snapshot("de", { a: "h1", b: "h2" })],
    });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toEqual([
      {
        reason: "targets",
        at: expect.any(String),
        locale: "de",
        delta: { added: 1, changed: 0, removed: 0 },
      },
    ]);
  });

  it("reports a removed key in a single target locale as a nonzero removed count", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const readLocaleSnapshot = sequencedReadLocaleSnapshot({
      en: [snapshot("en")],
      de: [snapshot("de", { a: "h1", b: "h2" }), snapshot("de", { a: "h1" })],
    });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toEqual([
      {
        reason: "targets",
        at: expect.any(String),
        locale: "de",
        delta: { added: 0, changed: 0, removed: 1 },
      },
    ]);
  });

  it("reports a value-only edit on an existing key as a nonzero changed count, not a no-op delta", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const readLocaleSnapshot = sequencedReadLocaleSnapshot({
      en: [snapshot("en")],
      de: [snapshot("de", { a: "h1" }), snapshot("de", { a: "h1-edited" })],
    });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toEqual([
      {
        reason: "targets",
        at: expect.any(String),
        locale: "de",
        delta: { added: 0, changed: 1, removed: 0 },
      },
    ]);
  });

  it("two different target locales changing within the same debounce window report separate, correctly attributed counts", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de", "fr"] });
    const readLocaleSnapshot = sequencedReadLocaleSnapshot({
      en: [snapshot("en")],
      de: [snapshot("de", { a: "h1" }), snapshot("de", { a: "h1", b: "h2" })],
      fr: [snapshot("fr", { x: "h1", y: "h2" }), snapshot("fr", { x: "h1" })],
    });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    harness.emit(2);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(2);
    const de = refresh.events.find((event) => event.locale === "de");
    const fr = refresh.events.find((event) => event.locale === "fr");
    expect(de).toEqual({
      reason: "targets",
      at: expect.any(String),
      locale: "de",
      delta: { added: 1, changed: 0, removed: 0 },
    });
    expect(fr).toEqual({
      reason: "targets",
      at: expect.any(String),
      locale: "fr",
      delta: { added: 0, changed: 0, removed: 1 },
    });
  });

  it("reports the source file's own delta, tagged reason source, with no derived per-target drift", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const readLocaleSnapshot = sequencedReadLocaleSnapshot({
      en: [snapshot("en", { greeting: "h1" }), snapshot("en", { greeting: "h1", farewell: "h2" })],
      de: [snapshot("de")],
    });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(0);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toEqual([
      {
        reason: "source",
        at: expect.any(String),
        locale: "en",
        delta: { added: 1, changed: 0, removed: 0 },
      },
    ]);
  });

  it("a lock-file change stays a bare { reason, at } event: no locale or delta field at all", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      {
        createWatcher: harness.createWatcher,
        readLocaleSnapshot: emptyReadLocaleSnapshot,
        readFileIdentity: unknownFileIdentity,
      },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(2);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(1);
    expect(refresh.events[0]).toEqual({ reason: "lock", at: expect.any(String) });
    expect(Object.keys(refresh.events[0] as RefreshEvent).sort()).toEqual(["at", "reason"]);
  });

  it("a change that produces no net content delta still emits an event, with all counts zero rather than being omitted", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const readLocaleSnapshot = sequencedReadLocaleSnapshot({
      en: [snapshot("en")],
      de: [snapshot("de", { a: "h1" }), snapshot("de", { a: "h1" })],
    });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toEqual([
      {
        reason: "targets",
        at: expect.any(String),
        locale: "de",
        delta: { added: 0, changed: 0, removed: 0 },
      },
    ]);
  });

  it("the first change after startup is diffed against the snapshot taken at startup, not an absent baseline", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const readLocaleSnapshot = sequencedReadLocaleSnapshot({
      en: [snapshot("en")],
      de: [snapshot("de", { a: "h1", b: "h2" }), snapshot("de", { a: "h1", b: "h2-edited" })],
    });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toEqual([
      {
        reason: "targets",
        at: expect.any(String),
        locale: "de",
        delta: { added: 0, changed: 1, removed: 0 },
      },
    ]);
  });

  it("a real emitted event never carries a field beyond reason, at, locale, and numeric delta counts", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const readLocaleSnapshot = sequencedReadLocaleSnapshot({
      en: [snapshot("en")],
      de: [snapshot("de", { a: "h1" }), snapshot("de", { a: "h1", b: "h2" })],
    });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    const event = refresh.events[0] as RefreshEvent;
    expect(Object.keys(event).sort()).toEqual(["at", "delta", "locale", "reason"]);
    expect(typeof event.locale).toBe("string");
    const delta = event.delta as NonNullable<RefreshEvent["delta"]>;
    expect(Object.keys(delta).sort()).toEqual(["added", "changed", "removed"]);
    for (const value of Object.values(delta)) {
      expect(typeof value).toBe("number");
    }
  });
});

describe("createProjectWatcher: same-locale settle race (criterion 12)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("two rapid changes to the same locale settle in trigger order, never stomping the baseline out of order", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });

    const s0 = snapshot("de", { a: "h1" });
    const s1 = snapshot("de", { a: "h1", b: "h2" });
    const s2 = snapshot("de", { a: "h1", b: "h2", c: "h3" });

    const calls: string[] = [];
    let releaseFirstSettleRead: (() => void) | undefined;
    let deCallIndex = 0;
    const readLocaleSnapshot = async (locale: string): Promise<LocaleFileSnapshot> => {
      calls.push(locale);
      if (locale !== "de") {
        return snapshot(locale);
      }
      deCallIndex += 1;
      if (deCallIndex === 1) {
        return s0;
      }
      if (deCallIndex === 2) {
        await new Promise<void>((resolveGate) => {
          releaseFirstSettleRead = resolveGate;
        });
        return s1;
      }
      return s2;
    };

    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);
    expect(calls).toEqual(["en", "de"]);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    expect(calls).toEqual(["en", "de", "de"]);
    expect(refresh.events).toEqual([]);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    expect(calls).toEqual(["en", "de", "de"]);
    expect(refresh.events).toEqual([]);

    releaseFirstSettleRead?.();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(calls).toEqual(["en", "de", "de", "de"]);
    expect(refresh.events).toHaveLength(2);
    expect(refresh.events[0]).toEqual({
      reason: "targets",
      at: expect.any(String),
      locale: "de",
      delta: { added: 1, changed: 0, removed: 0 },
    });
    expect(refresh.events[1]).toEqual({
      reason: "targets",
      at: expect.any(String),
      locale: "de",
      delta: { added: 1, changed: 0, removed: 0 },
    });

    await watcher.close();
  });
});

describe("createProjectWatcher: settle failure fallback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a settle that fails to read falls back to the bare { reason, at } event and leaves the baseline untouched", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });

    let deCall = 0;
    const readLocaleSnapshot = async (locale: string): Promise<LocaleFileSnapshot> => {
      if (locale !== "de") {
        return snapshot(locale);
      }
      deCall += 1;
      if (deCall === 1) {
        return snapshot("de", { a: "h1" });
      }
      if (deCall === 2) {
        throw new Error("simulated transient read failure");
      }
      return snapshot("de", { a: "h1", b: "h2" });
    };

    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(1);
    expect(refresh.events[0]).toEqual({ reason: "targets", at: expect.any(String) });
    expect(Object.keys(refresh.events[0] as RefreshEvent).sort()).toEqual(["at", "reason"]);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toHaveLength(2);
    expect(refresh.events[1]).toEqual({
      reason: "targets",
      at: expect.any(String),
      locale: "de",
      delta: { added: 1, changed: 0, removed: 0 },
    });
  });

  it("a startup priming read that fails falls back to an empty baseline instead of preventing the watcher from starting", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });

    let dePrimed = false;
    const readLocaleSnapshot = async (locale: string): Promise<LocaleFileSnapshot> => {
      if (locale === "de" && !dePrimed) {
        dePrimed = true;
        throw new Error("simulated malformed file already on disk at startup");
      }
      return locale === "de" ? snapshot("de", { a: "h1" }) : snapshot(locale);
    };

    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(1);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();

    expect(refresh.events).toEqual([
      {
        reason: "targets",
        at: expect.any(String),
        locale: "de",
        delta: { added: 1, changed: 0, removed: 0 },
      },
    ]);
  });
});

describe("createProjectWatcher: default read wiring", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("threads an injected deps.fs into the default (non-injected) snapshot read", async () => {
    const root = await mkdtemp(join(tmpdir(), "verbatra-studio-watcher-fs-"));
    try {
      await mkdir(join(root, "locales"), { recursive: true });
      await writeFile(join(root, "locales", "en.json"), JSON.stringify({ greeting: "hello" }));

      const fs: SdkFs = {
        fileExists: async () => false,
        readFileBounded: async () => ({ kind: "missing" }),
        readBytesBounded: async () => ({ kind: "missing" }),
        writeFile: async () => {},
        writeBytes: async () => {},
        createExclusive: async () => true,
        deleteFile: async () => {},
      };

      const harness = multiWatcherHarness();
      const refresh = collectRefresh();
      const config: VerbatraConfig = baseStudioConfig({ targetLocales: [] });
      const watcher = await createProjectWatcher(
        { config, projectRoot: root, debounceMs: 50 },
        { createWatcher: harness.createWatcher, fs },
      );
      watcher.onRefresh(refresh.listener);

      await writeFile(
        join(root, "locales", "en.json"),
        JSON.stringify({ greeting: "hello", farewell: "bye" }),
      );

      harness.emit(0);
      await vi.advanceTimersByTimeAsync(50);
      await flushMicrotasks();

      expect(refresh.events).toEqual([
        {
          reason: "source",
          at: expect.any(String),
          locale: "en",
          delta: { added: 0, changed: 0, removed: 0 },
        },
      ]);
      await watcher.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("createProjectWatcher: close", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("close() clears every pending debounce timer and closes every dynamically-sized underlying watcher", async () => {
    const harness = multiWatcherHarness();
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de", "fr"] });
    const watcher = await createProjectWatcher(
      { config, projectRoot: PROJECT_ROOT, debounceMs: 50 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot: emptyReadLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);

    harness.emit(0);
    harness.emit(1);
    harness.emit(2);
    await watcher.close();
    await vi.advanceTimersByTimeAsync(100);
    await flushMicrotasks();

    expect(refresh.events).toEqual([]);
    expect(harness.calls).toHaveLength(5);
    expect(harness.calls.every((call) => call.closed)).toBe(true);
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("defaultCreateStudioWatcher: real chokidar behavior", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "verbatra-studio-watcher-"));
    await mkdir(join(root, "locales"), { recursive: true });
    await writeFile(join(root, "locales", "en.json"), JSON.stringify({ greeting: "hello" }));
    await wait(300);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("a target file created after startup (parent directory already present) raises a targets refresh with its added-key delta", async () => {
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const refresh = collectRefresh();
    const watcher = await createProjectWatcher(
      { config, projectRoot: root, debounceMs: 50 },
      { createWatcher: defaultCreateStudioWatcher },
    );
    watcher.onRefresh(refresh.listener);

    await wait(200);
    await writeFile(join(root, "locales", "de.json"), JSON.stringify({ greeting: "hallo" }));
    await wait(600);

    expect(refresh.events.length).toBeGreaterThanOrEqual(1);
    expect(refresh.events[0]).toEqual({
      reason: "targets",
      at: expect.any(String),
      locale: "de",
      delta: { added: 1, changed: 0, removed: 0 },
    });
    for (const event of refresh.events.slice(1)) {
      expect(event).toEqual({
        reason: "targets",
        at: expect.any(String),
        locale: "de",
        delta: { added: 0, changed: 0, removed: 0 },
      });
    }
    await watcher.close();
  }, 5000);

  it("a write to the provenance file raises a lock refresh so provenance badges update live", async () => {
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const refresh = collectRefresh();
    const watcher = await createProjectWatcher(
      { config, projectRoot: root, debounceMs: 50 },
      { createWatcher: defaultCreateStudioWatcher },
    );
    watcher.onRefresh(refresh.listener);
    await wait(200);

    await writeFile(join(root, PROVENANCE_FILE_NAME), JSON.stringify({ version: 1, locales: {} }));
    await wait(600);

    expect(refresh.events).toEqual([{ reason: "lock", at: expect.any(String) }]);
    await watcher.close();
  }, 5000);

  it("a real atomic temp-write-then-rename over the lock file raises exactly one lock refresh", async () => {
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: ["de"] });
    const refresh = collectRefresh();
    const watcher = await createProjectWatcher(
      { config, projectRoot: root, debounceMs: 50 },
      { createWatcher: defaultCreateStudioWatcher },
    );
    watcher.onRefresh(refresh.listener);
    await wait(200);

    const lockPath = join(root, LOCK_FILE_NAME);
    const tempPath = join(dirname(lockPath), ".verbatra.lock.json.tmp-probe");
    await writeFile(tempPath, JSON.stringify({ version: 1, locales: {} }));
    await rename(tempPath, lockPath);
    await wait(600);

    expect(refresh.events).toEqual([{ reason: "lock", at: expect.any(String) }]);
    await watcher.close();
  }, 5000);

  it("temp-file churn (the intermediate temp file appearing and disappearing) never itself raises an event", async () => {
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: [] });
    const refresh = collectRefresh();
    const watcher = await createProjectWatcher(
      { config, projectRoot: root, debounceMs: 50 },
      { createWatcher: defaultCreateStudioWatcher },
    );
    watcher.onRefresh(refresh.listener);
    await wait(200);

    const lockPath = join(root, LOCK_FILE_NAME);
    const tempPath = join(dirname(lockPath), ".verbatra.lock.json.tmp-churn");
    await writeFile(tempPath, JSON.stringify({ version: 1, locales: {} }));
    await rm(tempPath, { force: true });
    await wait(600);

    expect(refresh.events).toEqual([]);
    await watcher.close();
  }, 5000);
});

describe("createProjectWatcher: default file identity read against a real file system", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "verbatra-studio-identity-"));
    await mkdir(join(root, "locales"), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function realIdentityWatcher(
    harness: ReturnType<typeof multiWatcherHarness>,
  ): Promise<{ events: RefreshEvent[] }> {
    const refresh = collectRefresh();
    const config: VerbatraConfig = baseStudioConfig({ targetLocales: [] });
    const watcher = await createProjectWatcher(
      { config, projectRoot: root, debounceMs: 5 },
      { createWatcher: harness.createWatcher, readLocaleSnapshot: emptyReadLocaleSnapshot },
    );
    watcher.onRefresh(refresh.listener);
    return refresh;
  }

  it("publishes one refresh for two triggers over a lock file that did not change in between", async () => {
    const harness = multiWatcherHarness();
    await writeFile(join(root, LOCK_FILE_NAME), JSON.stringify({ version: 1, locales: {} }));
    const refresh = await realIdentityWatcher(harness);

    harness.emit(1);
    await wait(60);
    harness.emit(1);
    await wait(60);

    expect(refresh.events).toEqual([{ reason: "lock", at: expect.any(String) }]);
  });

  it("publishes both refreshes when the lock file is rewritten between the two triggers", async () => {
    const harness = multiWatcherHarness();
    const lockPath = join(root, LOCK_FILE_NAME);
    await writeFile(lockPath, JSON.stringify({ version: 1, locales: {} }));
    const refresh = await realIdentityWatcher(harness);

    harness.emit(1);
    await wait(60);
    await writeFile(lockPath, JSON.stringify({ version: 1, locales: { de: {} } }));
    harness.emit(1);
    await wait(60);

    expect(refresh.events).toHaveLength(2);
  });

  it("fails open and publishes both refreshes while the lock file does not exist at all", async () => {
    const harness = multiWatcherHarness();
    const refresh = await realIdentityWatcher(harness);

    harness.emit(1);
    await wait(60);
    harness.emit(1);
    await wait(60);

    expect(refresh.events).toHaveLength(2);
  });
});
