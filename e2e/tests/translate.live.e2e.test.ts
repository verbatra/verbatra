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
import {
  type BillingRow,
  deeplBilledCharacters,
  deeplTexts,
  prepareWireRecorder,
  publishBillingObservation,
  readWireRecords,
  unmaskedDeepLBody,
  type WireRecord,
} from "../src/wire-billing.js";

const provider = providerFromEnv();

const TARGET: RunTarget = { locale: "de", key: "farewell" };

const LLM_PROVIDERS: ReadonlySet<ProviderEnv["id"]> = new Set<ProviderEnv["id"]>([
  "anthropic",
  "openai",
  "gemini",
]);
const MACHINE_TRANSLATION_PROVIDERS: ReadonlySet<ProviderEnv["id"]> = new Set<ProviderEnv["id"]>([
  "deepl",
  "google-translate",
]);
const MASKED_TARGET: RunTarget = { locale: "de", key: "inbox" };
const MASKED_SOURCE = "Hello {{name}}, you have {{count}} new messages & replies";
const GOOGLE_BILLING_NOTE =
  "Google Cloud Translation reports no billed count per request. Run this case alone on a day " +
  "the key is otherwise unused, then compare the day's billed characters in the Cloud console " +
  "with the two masked columns: a match on Characters sent means the span tags are billed.";
const DEEPL_BILLING_NOTE =
  "DeepL figures come from show_billed_characters on a resend of the exact masked body verbatra " +
  "sent, and of the same values unmasked; cross-check against the DeepL account usage page.";
const SERBIAN_LATIN_TARGET: RunTarget = { locale: "sr-Latn", key: "farewell" };
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;

interface LiveTranslateProject {
  readonly consumer: Consumer;
  readonly provider: ProviderEnv;
  readonly name: string;
  readonly target: RunTarget;
  readonly files: Readonly<Record<string, Record<string, string>>>;
  readonly env?: Record<string, string>;
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
    env: { ...project.env, [project.provider.envVar]: project.provider.key },
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

describe.skipIf(provider === null || !MACHINE_TRANSLATION_PROVIDERS.has(provider.id))(
  `translate a placeholder-bearing value (live: ${provider?.id ?? "skipped"})`,
  () => {
    let consumer: Consumer;

    beforeAll(async () => {
      consumer = await readSharedConsumer();
    }, 180_000);

    it("keeps every placeholder byte-exact", async (ctx) => {
      if (provider === null) {
        return;
      }
      const recorder = await prepareWireRecorder(join(consumer.dir, "translate-live-masked-wire"));
      const dir = await translateLive(ctx, {
        consumer,
        provider,
        name: "translate-live-masked",
        target: MASKED_TARGET,
        files: { en: { inbox: MASKED_SOURCE } },
        env: recorder.env,
      });

      const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
      const inbox = de.inbox ?? "";
      expect(inbox).toContain("{{name}}");
      expect(inbox).toContain("{{count}}");
      expect(inbox).not.toMatch(/<x>|<span|&amp;/);

      const checked = await runVerbatra(consumer, ["check", "--cwd", dir]);
      expect(checked.exitCode).toBe(0);

      const records = await readWireRecords(recorder.logPath);
      expect(records.length).toBeGreaterThan(0);
      await observeMaskingBilling(provider, records);
    });
  },
);

async function observeMaskingBilling(
  live: ProviderEnv,
  records: readonly WireRecord[],
): Promise<void> {
  if (live.id === "deepl") {
    const bodies = records.flatMap((record) => (record.provider === "deepl" ? [record.body] : []));
    const masked = await Promise.all(bodies.map((body) => deeplBilledCharacters(live.key, body)));
    const unmaskedBody = unmaskedDeepLBody(bodies[0] ?? "", [MASKED_SOURCE]);
    const rows: BillingRow[] = [
      {
        provider: live.id,
        variant: "masked",
        requests: bodies.length,
        texts: bodies.flatMap(deeplTexts),
        billedCharacters: masked.join(" + "),
      },
      {
        provider: live.id,
        variant: "unmasked",
        requests: 1,
        texts: [MASKED_SOURCE],
        billedCharacters: await deeplBilledCharacters(live.key, unmaskedBody),
      },
    ];
    await publishBillingObservation(rows, DEEPL_BILLING_NOTE);
    return;
  }
  const sent = records.flatMap((record) =>
    record.provider === "google-translate" ? [record.texts] : [],
  );
  await publishBillingObservation(
    [
      {
        provider: live.id,
        variant: "masked",
        requests: sent.length,
        texts: sent.flat(),
        billedCharacters: "see the Cloud console",
      },
      {
        provider: live.id,
        variant: "unmasked",
        requests: 0,
        texts: [MASKED_SOURCE],
        billedCharacters: "not sent (the same text unmasked)",
      },
    ],
    GOOGLE_BILLING_NOTE,
  );
}
