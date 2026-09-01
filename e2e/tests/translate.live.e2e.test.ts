import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  providerConfigBlock,
  providerFromEnv,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";
import { classifyLiveRun, type RunTarget } from "../src/run-outcome.js";

const provider = providerFromEnv();

const TARGET: RunTarget = { locale: "de", key: "farewell" };

describe.skipIf(provider === null)(`translate (live: ${provider?.id ?? "skipped"})`, () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await readSharedConsumer();
  }, 180_000);

  it("translates the missing key and leaves the project in sync", async (ctx) => {
    if (provider === null) {
      return;
    }
    const dir = join(consumer.dir, "translate-live");
    await mkdir(dir, { recursive: true });
    await writeFileIn(
      dir,
      "verbatra.config.ts",
      `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: ${providerConfigBlock(provider)},\n});\n`,
    );
    await writeJsonIn(dir, "locales/en.json", {
      greeting: "Hello {{name}}",
      farewell: "Goodbye",
    });
    await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo {{name}}" });

    const translated = await runVerbatra(consumer, ["translate", "--json", "--cwd", dir], {
      env: { [provider.envVar]: provider.key },
    });
    const verdict = classifyLiveRun(translated, TARGET);
    if (verdict.kind === "failed") {
      expect.fail(`translate did not deliver "${TARGET.key}": ${verdict.detail}`);
    }
    if (verdict.kind === "throttled") {
      ctx.skip(
        `The provider rate-limited the translate run, so the live translation path never executed: ${verdict.detail}`,
      );
    }
    expect(translated.exitCode).toBe(0);

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    const farewell = de.farewell ?? "";
    expect(farewell.length).toBeGreaterThan(0);
    expect(de.greeting ?? "").toContain("{{name}}");

    const checked = await runVerbatra(consumer, ["check", "--cwd", dir]);
    expect(checked.exitCode).toBe(0);
  });
});
