import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  type EnvelopeStream,
  makeConsumer,
  parseNdjsonEnvelopes,
  providerConfigBlock,
  providerFromEnv,
  readEnvelopeStream,
  readJsonIn,
  type Subprocess,
  spawnVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";
import {
  classifyRunEnvelope,
  type RunSummary,
  type RunTarget,
  type SettledKeyOutcome,
} from "../src/run-outcome.js";

const provider = providerFromEnv();

const SOURCE_FILE = "locales/en.json";

const RUN_RECORD_TIMEOUT_MS = 60_000;

async function awaitRunOutcome(
  stream: EnvelopeStream<RunSummary>,
  target: RunTarget,
): Promise<SettledKeyOutcome> {
  const deadline = Date.now() + RUN_RECORD_TIMEOUT_MS;
  for (;;) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `No watch run reported on "${target.key}" within ${RUN_RECORD_TIMEOUT_MS}ms.`,
      );
    }
    const outcome = classifyRunEnvelope(await stream.next({ timeoutMs: remainingMs }), target);
    if (outcome.kind !== "pending") {
      return outcome;
    }
  }
}

interface DeliveryRequest {
  readonly stream: EnvelopeStream<RunSummary>;
  readonly target: RunTarget;
  readonly note: (message: string) => Promise<unknown>;
}

async function awaitDelivery(request: DeliveryRequest): Promise<string | undefined> {
  const outcome = await awaitRunOutcome(request.stream, request.target);
  if (outcome.kind === "delivered") {
    return undefined;
  }
  if (outcome.kind === "failed") {
    throw new Error(`watch run failed on "${request.target.key}": ${outcome.detail}`);
  }
  await request.note(`"${request.target.key}" was throttled: ${outcome.detail}`);
  return outcome.detail;
}

describe.skipIf(provider === null)(`watch (live: ${provider?.id ?? "skipped"})`, () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await makeConsumer();
  }, 180_000);

  it("translates on startup and again when the source changes, then stops on interrupt", async (ctx) => {
    if (provider === null) {
      return;
    }
    const dir = join(consumer.dir, "watch-live");
    await mkdir(dir, { recursive: true });
    const initialSource = { greeting: "Hello {{name}}", farewell: "Goodbye" };
    await writeJsonIn(dir, SOURCE_FILE, initialSource);
    await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo {{name}}" });
    await writeFileIn(
      dir,
      "verbatra.config.ts",
      `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: ${providerConfigBlock(provider)},\n});\n`,
    );

    const watcher: Subprocess = spawnVerbatra(consumer, ["watch", "--json", "--cwd", dir], {
      env: { [provider.envVar]: provider.key },
    });
    const stream = readEnvelopeStream<RunSummary>(watcher);
    const note = (message: string): Promise<unknown> => ctx.annotate(message);
    let throttled: string | undefined;
    let stopResult: Awaited<Subprocess> | undefined;

    try {
      throttled = await awaitDelivery({
        stream,
        target: { locale: "de", key: "farewell" },
        note,
      });

      if (throttled === undefined) {
        const changedSource = { ...initialSource, welcome: "Welcome {{name}}" };
        await writeJsonIn(dir, SOURCE_FILE, changedSource);
        throttled = await awaitDelivery({
          stream,
          target: { locale: "de", key: "welcome" },
          note,
        });
      }
    } finally {
      watcher.kill("SIGINT");
      stopResult = await watcher;
    }

    expect(stopResult.signal).toBeUndefined();
    expect(stopResult.exitCode).toBe(0);

    const records = parseNdjsonEnvelopes(stopResult.stdout);
    expect(records.length).toBeGreaterThan(0);

    expect(stopResult.stdout).not.toContain(provider.key);
    expect(stopResult.stderr).not.toContain(provider.key);

    if (throttled !== undefined) {
      ctx.skip(
        `The provider rate-limited the watch run, so the translation half of this test could not run: ${throttled}`,
      );
    }

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    expect((de.farewell ?? "").length).toBeGreaterThan(0);
    expect(de.welcome ?? "").toContain("{{name}}");
    expect(de.greeting ?? "").toContain("{{name}}");
  }, 480_000);
});
