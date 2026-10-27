import type { ProgressEvent, WatchController, WatchInput } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, flush, makeSummary, recordingDeps } from "./test-support.js";
import type { Session } from "./types.js";

const baseEvents: readonly ProgressEvent[] = [
  { type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 1 },
  { type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 1 },
  {
    type: "locale-finished",
    locale: "de",
    status: "succeeded",
    translated: 1,
    localeIndex: 0,
    totalLocales: 1,
  },
  { type: "run-finished", localesCompleted: 1, localesFailed: 0 },
];

const everyEvent: readonly ProgressEvent[] = [
  { type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 1 },
  { type: "locale-planned", locale: "de", keys: 1, batches: 1, cacheHits: 0 },
  { type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 1 },
  { type: "provider-retry", attempt: 2, delayMs: 250, status: 429 },
  { type: "repair", locale: "de", keys: 1 },
  { type: "split-retry", locale: "de", keys: 2 },
  { type: "batch-finished", locale: "de", batchIndex: 1, totalBatches: 1, durationMs: 12 },
  { type: "writing", locale: "de" },
  {
    type: "locale-finished",
    locale: "de",
    status: "succeeded",
    translated: 1,
    localeIndex: 0,
    totalLocales: 1,
  },
  { type: "run-finished", localesCompleted: 1, localesFailed: 0 },
];

function withoutElapsed(stderr: string): string {
  return stderr.replace(/done in \d+\.\ds/g, "done in <elapsed>");
}

function emitting(events: readonly ProgressEvent[]) {
  return recordingDeps({
    translate: async (input) => {
      for (const event of events) {
        input.onProgress?.(event);
      }
      return makeSummary({ succeeded: ["de"] });
    },
  }).deps;
}

describe("run translate: the finer-grained SDK events leave existing output byte-identical", () => {
  it("--json stdout and stderr match a run that emits only the original four types", async () => {
    const baseline = captureStreams();
    await run(["translate", "--json"], emitting(baseEvents), baseline.streams);

    const extended = captureStreams();
    await run(["translate", "--json"], emitting(everyEvent), extended.streams);

    expect(extended.out()).toBe(baseline.out());
    expect(extended.err()).toBe(baseline.err());
  });

  it("human, piped output keeps every existing line and appends one per retry, repair, split and write", async () => {
    const baseline = captureStreams();
    await run(["translate"], emitting(baseEvents), baseline.streams);

    const extended = captureStreams();
    await run(["translate"], emitting(everyEvent), extended.streams);

    expect(extended.out()).toBe(baseline.out());
    expect(extended.err()).toMatch(/done in \d+\.\ds/);
    expect(withoutElapsed(extended.err())).toBe(
      withoutElapsed(baseline.err()).replace(
        "verbatra: de batch 1/1\n",
        [
          "verbatra: de batch 1/1",
          "verbatra: retrying the provider call (attempt 2, status 429) in 0.3s",
          "verbatra: de: asking again for 1 missing key",
          "verbatra: de: output cut off, retrying 2 keys in halves",
          "verbatra: de: writing",
          "",
        ].join("\n"),
      ),
    );
  });

  it("keeps --json stderr to one record per original event", async () => {
    const cap = captureStreams();

    await run(["translate", "--json"], emitting(everyEvent), cap.streams);

    const records = cap
      .err()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as ProgressEvent);
    expect(records).toEqual(baseEvents);
  });
});

describe("run watch: watch events stay out of --json, and plain stderr only gains the change line", () => {
  it("adds nothing to --json and one change line to plain stderr", async () => {
    async function watchWith(extra: readonly ProgressEvent[], argv: readonly string[]) {
      let session: Session | undefined;
      const { deps } = recordingDeps({
        watch: async (input: WatchInput): Promise<WatchController> => {
          for (const event of [...baseEvents, ...extra]) {
            input.onProgress?.(event);
          }
          return { stop: async () => {} };
        },
      });
      const cap = captureStreams();
      const done = run([...argv], deps, cap.streams, {
        onWatchSession: (s) => {
          session = s;
        },
      });
      await flush();
      session?.requestStop();
      await done;
      return cap.err();
    }

    const extra: readonly ProgressEvent[] = [
      { type: "change-detected", paths: ["/p/locales/en.json"] },
      { type: "idle" },
    ];
    expect(await watchWith(extra, ["watch", "--json"])).toBe(
      await watchWith([], ["watch", "--json"]),
    );
    const human = await watchWith(extra, ["watch"]);
    expect(human).toContain("verbatra: change detected: /p/locales/en.json\n");
    expect(human.replace("verbatra: change detected: /p/locales/en.json\n", "")).toBe(
      await watchWith([], ["watch"]),
    );
  });
});
