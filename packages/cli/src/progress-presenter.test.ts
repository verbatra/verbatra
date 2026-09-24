import { join, resolve } from "node:path";
import type { ProgressEvent } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  createProgressPresenter,
  scanProgressReporter,
  spinnerText,
} from "./progress-presenter.js";
import { CLEAR_LINE } from "./spinner.js";
import type { OutputMode, TerminalMode } from "./terminal-mode.js";
import { captureStreams, fakeClock } from "./test-support.js";
import { createUi } from "./ui.js";

const BASE = resolve("/work/app");

function terminal(mode: OutputMode, animate = false): TerminalMode {
  return { mode, color: false, animate, stdinIsTty: false };
}

const run: readonly ProgressEvent[] = [
  { type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 1 },
  { type: "locale-planned", locale: "de", keys: 3, batches: 2, cacheHits: 1 },
  { type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 2 },
  { type: "provider-retry", attempt: 2, delayMs: 500, status: 429 },
  { type: "repair", locale: "de", keys: 1 },
  { type: "split-retry", locale: "de", keys: 4 },
  { type: "batch-finished", locale: "de", batchIndex: 1, totalBatches: 2, durationMs: 1200 },
  { type: "writing", locale: "de" },
  { type: "locale-finished", locale: "de", translated: 3, localeIndex: 0, totalLocales: 1 },
  { type: "run-finished", localesCompleted: 1 },
];

describe("spinnerText", () => {
  it.each([
    [run[0], "de: starting (1/1)"],
    [run[1], "de: 3 to send in 2 batches, 1 from memory"],
    [
      { type: "locale-planned", locale: "de", keys: 1, batches: 1, cacheHits: 0 },
      "de: 1 to send in 1 batch, 0 from memory",
    ],
    [run[2], "de: batch 1/2"],
    [run[3], "retrying the provider call (attempt 2, status 429) in 0.5s"],
    [{ type: "provider-retry", attempt: 3 }, "retrying the provider call (attempt 3)"],
    [run[4], "de: asking again for 1 missing key"],
    [{ type: "repair", locale: "de", keys: 2 }, "de: asking again for 2 missing keys"],
    [run[5], "de: output cut off, retrying 4 keys in halves"],
    [run[6], "de: batch 1/2 done in 1.2s"],
    [run[7], "de: writing"],
    [run[8], undefined],
    [{ type: "idle" }, undefined],
  ] as const)("describes %j", (event, text) => {
    expect(spinnerText(event as ProgressEvent)).toBe(text);
  });
});

describe("createProgressPresenter: plain mode", () => {
  it("prints today's four progress lines and nothing for the finer-grained events", () => {
    const cap = captureStreams();
    const present = createProgressPresenter(createUi(cap.streams, terminal("plain")), {
      json: false,
      base: BASE,
    });

    run.forEach(present);

    expect(cap.err()).toBe(
      [
        "verbatra: translating de",
        "verbatra: de batch 1/2",
        "verbatra: de done, 3 translated",
        "verbatra: run finished, 1 locale processed",
        "",
      ].join("\n"),
    );
  });

  it("names a detected change relative to the working directory", () => {
    const cap = captureStreams();
    const present = createProgressPresenter(createUi(cap.streams, terminal("plain")), {
      json: false,
      base: BASE,
    });

    present({ type: "change-detected", paths: [join(BASE, "locales", "en.json")] });
    present({ type: "idle" });

    expect(cap.err()).toBe(`verbatra: change detected: ${join("locales", "en.json")}\n`);
  });
});

describe("createProgressPresenter: json mode", () => {
  it("writes only the original four records, whatever the terminal", () => {
    const cap = captureStreams();
    const present = createProgressPresenter(createUi(cap.streams, terminal("json")), {
      json: true,
      base: BASE,
    });

    run.forEach(present);
    present({ type: "change-detected", paths: ["/x"] });

    const types = cap
      .err()
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as ProgressEvent).type);
    expect(types).toEqual(["locale-started", "sub-batch", "locale-finished", "run-finished"]);
  });
});

describe("createProgressPresenter: animated terminal", () => {
  it("drives one spinner through the run, keeps each locale's finish line, and clears at the end", () => {
    const cap = captureStreams();
    const clock = fakeClock();
    const ui = createUi(cap.streams, terminal("tty", true), { clock, now: () => 0 });
    const present = createProgressPresenter(ui, { json: false, base: BASE });

    present(run[0] as ProgressEvent);
    clock.fireDelay();
    present(run[2] as ProgressEvent);
    present(run[3] as ProgressEvent);
    present(run[8] as ProgressEvent);
    present(run[9] as ProgressEvent);
    clock.tick();

    expect(cap.err()).toBe(
      [
        `${CLEAR_LINE}| de: starting (1/1)`,
        `${CLEAR_LINE}| de: batch 1/2`,
        `${CLEAR_LINE}| retrying the provider call (attempt 2, status 429) in 0.5s`,
        `${CLEAR_LINE}verbatra: de done, 3 translated\n`,
        "",
      ].join(""),
    );
  });

  it("starts a fresh spinner for the next watch run", () => {
    const cap = captureStreams();
    const clock = fakeClock();
    const ui = createUi(cap.streams, terminal("tty", true), { clock, now: () => 0 });
    const present = createProgressPresenter(ui, { json: false, base: BASE });

    present(run[0] as ProgressEvent);
    present(run[9] as ProgressEvent);
    present(run[0] as ProgressEvent);
    clock.fireDelay();

    expect(cap.err()).toBe(`${CLEAR_LINE}| de: starting (1/1)`);
  });
});

describe("scanProgressReporter", () => {
  it("updates the task with the running file count", () => {
    const updates: string[] = [];
    const report = scanProgressReporter({
      update: (text) => updates.push(text),
      succeed: () => {},
      fail: () => {},
      stop: () => {},
    });

    report({ type: "files-scanned", scanned: 3, total: 10 });

    expect(updates).toEqual(["scanned 3/10 files"]);
  });
});
