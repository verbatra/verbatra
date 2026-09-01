import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  type EnvelopeStream,
  type JsonEnvelope,
  readEnvelopeStream,
  readSharedConsumer,
  type Subprocess,
  spawnVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";
import type { RunLocaleSummary, RunSummary } from "../src/run-outcome.js";

const SOURCE_FILE = "locales/en.json";
const TARGET_FILE = "locales/de.json";

const RUN_RECORD_TIMEOUT_MS = 30_000;

const UNREACHABLE_PROVIDER =
  '{ id: "openai-compatible", options: { baseUrl: "http://127.0.0.1:1", model: "e2e-unreachable", maxOutputTokens: 256 } }';

function expectLocaleSummary(envelope: JsonEnvelope<RunSummary>, locale: string): RunLocaleSummary {
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
    const dir = join(consumer.dir, "watch-lifecycle");
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, SOURCE_FILE, { greeting: "Hello {{name}}" });
    await writeJsonIn(dir, TARGET_FILE, { greeting: "Hallo {{name}}" });
    await writeFileIn(
      dir,
      "verbatra.config.ts",
      `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: ${UNREACHABLE_PROVIDER},\n});\n`,
    );

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
});
