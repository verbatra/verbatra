import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it, type TestContext } from "vitest";
import {
  type Consumer,
  type ProviderEnv,
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

const LLM_PROVIDERS: ReadonlySet<ProviderEnv["id"]> = new Set<ProviderEnv["id"]>([
  "anthropic",
  "openai",
  "gemini",
]);
const SERBIAN_LATIN_TARGET: RunTarget = { locale: "sr-Latn", key: "farewell" };
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;

interface LiveTranslateProject {
  readonly consumer: Consumer;
  readonly provider: ProviderEnv;
  readonly name: string;
  readonly target: RunTarget;
  readonly files: Readonly<Record<string, Record<string, string>>>;
}

async function translateLive(ctx: TestContext, project: LiveTranslateProject): Promise<string> {
  const dir = join(project.consumer.dir, project.name);
  await mkdir(dir, { recursive: true });
  await writeFileIn(
    dir,
    "verbatra.config.ts",
    `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: [${JSON.stringify(project.target.locale)}],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: ${providerConfigBlock(project.provider)},\n});\n`,
  );
  for (const [locale, values] of Object.entries(project.files)) {
    await writeJsonIn(dir, `locales/${locale}.json`, values);
  }

  const translated = await runVerbatra(project.consumer, ["translate", "--json", "--cwd", dir], {
    env: { [project.provider.envVar]: project.provider.key },
  });
  const verdict = classifyLiveRun(translated, project.target);
  if (verdict.kind === "failed") {
    expect.fail(`translate did not deliver "${project.target.key}": ${verdict.detail}`);
  }
  if (verdict.kind === "throttled") {
    ctx.skip(
      `The provider rate-limited, timed out, or was unavailable during the translate run, so the live translation path never executed: ${verdict.detail}`,
    );
  }
  expect(translated.exitCode).toBe(0);
  return dir;
}

describe.skipIf(provider === null)(`translate (live: ${provider?.id ?? "skipped"})`, () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await readSharedConsumer();
  }, 180_000);

  it("translates the missing key and leaves the project in sync", async (ctx) => {
    if (provider === null) {
      return;
    }
    const dir = await translateLive(ctx, {
      consumer,
      provider,
      name: "translate-live",
      target: TARGET,
      files: {
        en: { greeting: "Hello {{name}}", farewell: "Goodbye" },
        de: { greeting: "Hallo {{name}}" },
      },
    });

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    const farewell = de.farewell ?? "";
    expect(farewell.length).toBeGreaterThan(0);
    expect(de.greeting ?? "").toContain("{{name}}");

    const checked = await runVerbatra(consumer, ["check", "--cwd", dir]);
    expect(checked.exitCode).toBe(0);
  });
});

describe.skipIf(provider === null || !LLM_PROVIDERS.has(provider.id))(
  `translate into a named script (live: ${provider?.id ?? "skipped"})`,
  () => {
    let consumer: Consumer;

    beforeAll(async () => {
      consumer = await readSharedConsumer();
    }, 180_000);

    it("writes sr-Latn in Latin script, not Cyrillic", async (ctx) => {
      if (provider === null) {
        return;
      }
      const dir = await translateLive(ctx, {
        consumer,
        provider,
        name: "translate-live-sr-latn",
        target: SERBIAN_LATIN_TARGET,
        files: { en: { farewell: "Goodbye, see you tomorrow at the station" } },
      });

      const serbian = await readJsonIn<Record<string, string>>(dir, "locales/sr-Latn.json");
      const farewell = serbian.farewell ?? "";
      expect(farewell).toMatch(LATIN);
      expect(farewell).not.toMatch(CYRILLIC);
    });
  },
);
