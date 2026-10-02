import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProgressEvent } from "../progress/types.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { type CreateWatcher, watch } from "./watch.js";

function triggerableWatcher(): { create: CreateWatcher; fire: () => void } {
  let listener: (() => void) | undefined;
  return {
    create: () => ({
      onChange: (callback) => {
        listener = callback;
      },
      close: async () => {},
    }),
    fire: () => listener?.(),
  };
}

const inertWatcher: CreateWatcher = () => ({
  onChange: () => {},
  close: async () => {},
});

describe("watch: onProgress threads into each run and reaches the sub-batch loop", () => {
  it("emits real locale and sub-batch events from the initial run", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "1", b: "2", c: "3" });
    const config = baseConfig({ targetLocales: ["de"], maxBatchSize: 2 });
    const { provider } = makeStubProvider();
    const events: ProgressEvent[] = [];

    const controller = await watch(
      { config, cwd: dir, onRun: () => {}, onProgress: (event) => events.push(event) },
      { createWatcher: inertWatcher, createProvider: () => provider },
    );
    await controller.stop();

    expect(events.map((event) => event.type)).toEqual([
      "locale-started",
      "locale-planned",
      "sub-batch",
      "batch-finished",
      "sub-batch",
      "batch-finished",
      "writing",
      "locale-finished",
      "run-finished",
    ]);
  });

  it("goes idle after each run and reports a settled change to the source file", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "1" });
    const config = baseConfig({ targetLocales: ["de"] });
    const { provider } = makeStubProvider();
    const events: ProgressEvent[] = [];
    const watcher = triggerableWatcher();
    let runs = 0;

    const controller = await watch(
      {
        config,
        cwd: dir,
        debounceMs: 1,
        onRun: () => {
          runs += 1;
        },
        onProgress: (event) => events.push(event),
      },
      { createWatcher: watcher.create, createProvider: () => provider },
    );
    await vi.waitFor(() => expect(events.at(-1)).toEqual({ type: "idle" }));
    watcher.fire();
    await vi.waitFor(() => expect(runs).toBe(2));
    await vi.waitFor(() => expect(events.at(-1)).toEqual({ type: "idle" }));
    await controller.stop();

    expect(events).toContainEqual({
      type: "change-detected",
      paths: [join(dir, "locales", "en.json")],
    });
    expect(events.filter((event) => event.type === "idle")).toHaveLength(2);
    const changed = events.findIndex((event) => event.type === "change-detected");
    expect(events.slice(changed + 1).some((event) => event.type === "locale-started")).toBe(true);
  });
});
