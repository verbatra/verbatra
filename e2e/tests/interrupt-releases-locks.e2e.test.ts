import { access, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  pollUntil,
  readSharedConsumer,
  spawnVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";
import { type StalledEndpoint, startStalledEndpoint } from "../src/stalled-endpoint.js";

const LOCKS_DIR = ".verbatra-local/locks";
const HELD_TIMEOUT_MS = 30_000;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function lockFilesIn(dir: string): Promise<string[]> {
  const entries = await readdir(join(dir, LOCKS_DIR)).catch(() => []);
  return entries.filter((name) => name.endsWith(".lock"));
}

describe("an interrupt releases the write locks a translate run holds (no provider key)", () => {
  let consumer: Consumer;
  let endpoint: StalledEndpoint;

  beforeAll(async () => {
    consumer = await readSharedConsumer();
    endpoint = await startStalledEndpoint();
  }, 180_000);

  afterAll(async () => {
    await endpoint.close();
  });

  async function scaffold(name: string): Promise<string> {
    const dir = join(consumer.dir, name);
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, "locales/en.json", { greeting: "Hello" });
    await writeFileIn(
      dir,
      "verbatra.config.ts",
      `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: { id: "openai-compatible", options: { baseUrl: ${JSON.stringify(endpoint.baseUrl)}, model: "e2e-stalled", maxOutputTokens: 256, requestTimeoutMs: 600000 } },\n});\n`,
    );
    return dir;
  }

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)(
    "exits %s with %i and leaves no lock file behind",
    async (signal, expectedExit) => {
      const dir = await scaffold(`interrupt-${signal.toLowerCase()}`);
      const requestsBefore = endpoint.requestsReceived();
      const run = spawnVerbatra(consumer, ["translate", "--cwd", dir]);

      try {
        await pollUntil(
          async () =>
            endpoint.requestsReceived() > requestsBefore &&
            (await exists(join(dir, LOCKS_DIR, "de.lock"))),
          { timeoutMs: HELD_TIMEOUT_MS, intervalMs: 50 },
        );

        run.kill(signal);
        const result = await run;

        expect(result.signal).toBeUndefined();
        expect(result.exitCode).toBe(expectedExit);
        expect(await lockFilesIn(dir)).toEqual([]);
      } finally {
        run.kill("SIGKILL");
      }
    },
    90_000,
  );
});
