import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  type EnvelopeStream,
  JSON_ENVELOPE_VERSION,
  type JsonEnvelope,
  pollUntil,
  readEnvelopeStream,
  readSharedConsumer,
  type Subprocess,
  seedWatchProject,
  spawnVerbatra,
  UNREACHABLE_PROVIDER,
  writeJsonIn,
} from "../src/harness.js";
import type { RunLocaleSummary, RunSummary } from "../src/run-outcome.js";

const SOURCE_FILE = "locales/en.json";
const TARGET_FILE = "locales/de.json";

const RUN_RECORD_TIMEOUT_MS = 30_000;

function expectLocaleSummary(envelope: JsonEnvelope<RunSummary>, locale: string): RunLocaleSummary {
  expect(envelope.version).toBe(JSON_ENVELOPE_VERSION);
  expect(envelope.command).toBe("watch");
  if (!envelope.ok) {
    throw new Error(`Expected a successful watch run, got ${envelope.code}: ${envelope.message}`);
  }
  const summary = (envelope.result.locales ?? []).find((entry) => entry.locale === locale);
  if (summary === undefined) {
    throw new Error(`Expected the run to report locale "${locale}"`);
  }
  return summary;
}

function expectNothingWithheld(summary: RunLocaleSummary): void {
  expect(summary.status).toBe("succeeded");
  expect(summary.providerFailures ?? []).toEqual([]);
  expect(summary.integrityMismatches ?? []).toEqual([]);
}

describe("watch lifecycle (no provider key, no network)", () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await readSharedConsumer();
  }, 180_000);

  it("runs successfully on startup, runs again when the source changes, and exits 0 on interrupt", async () => {
    const dir = await seedWatchProject(join(consumer.dir, "watch-lifecycle"), UNREACHABLE_PROVIDER);

    const watcher: Subprocess = spawnVerbatra(consumer, ["watch", "--json", "--cwd", dir], {});
    const stream: EnvelopeStream<RunSummary> = readEnvelopeStream(watcher);

    try {
      const startup = expectLocaleSummary(
        await stream.next({ timeoutMs: RUN_RECORD_TIMEOUT_MS }),
        "de",
      );
      expectNothingWithheld(startup);
      expect(startup.unchanged ?? []).toContain("greeting");

      await writeJsonIn(dir, TARGET_FILE, {
        greeting: "Hallo {{name}}",
        farewell: "Auf Wiedersehen",
      });
      await writeJsonIn(dir, SOURCE_FILE, { greeting: "Hello {{name}}", farewell: "Goodbye" });

      const afterChange = expectLocaleSummary(
        await stream.next({ timeoutMs: RUN_RECORD_TIMEOUT_MS }),
        "de",
      );
      expectNothingWithheld(afterChange);
      expect(afterChange.unchanged ?? []).toContain("farewell");

      watcher.kill("SIGINT");
      const result = await watcher;
      expect(result.signal).toBeUndefined();
      expect(result.exitCode).toBe(0);
    } finally {
      watcher.kill("SIGKILL");
    }
  }, 90_000);

  it("says in human mode that it is waiting after a run and that it stopped", async () => {
    const dir = await seedWatchProject(
      join(consumer.dir, "watch-lifecycle-human"),
      UNREACHABLE_PROVIDER,
      { source: { greeting: "Hello" }, target: { greeting: "Hallo" } },
    );

    const watcher: Subprocess = spawnVerbatra(consumer, ["watch", "--cwd", dir], {});
    let stderr = "";
    watcher.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    try {
      await pollUntil(() => stderr.includes("verbatra: waiting for changes...\n"), {
        timeoutMs: RUN_RECORD_TIMEOUT_MS,
        intervalMs: 100,
      });
      watcher.kill("SIGINT");
      const result = await watcher;

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("1 succeeded, 0 partial, 0 failed");
      expect(result.stdout).not.toContain("waiting for changes");
      expect(result.stderr).toContain("verbatra: stopping, finishing current run...\n");
      expect(result.stderr).toMatch(/verbatra: stopped$/);
      expect(result.stderr).not.toContain("Ctrl-C");
    } finally {
      watcher.kill("SIGKILL");
    }
  }, 90_000);
});
