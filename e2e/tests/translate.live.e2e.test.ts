import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it, type TestContext } from "vitest";
import {
  type Consumer,
  liveRunRequired,
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
  parseWireLog,
  prepareWireRecorder,
  publishBillingObservation,
  readWireLog,
  sendUnmaskedGoogleBatch,
  sumBilled,
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
const GOOGLE_BATCH = process.env.E2E_GOOGLE_BATCH === "unmasked" ? "unmasked" : "masked";
const GOOGLE_BILLING_NOTE =
  "Google Cloud Translation reports no billed count per request. This run sent only the batch " +
  "shown; compare the day's billed characters in the Cloud console with the day of the other " +
  "batch (see e2e/README.md).";
const DEEPL_BILLING_NOTE =
  "DeepL figures are the billed_characters DeepL returned: for the masked batch on the CLI's own " +
  "request, for the unmasked one on a single direct request with the same text.";
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
    if (liveRunRequired()) {
      expect.fail(`E2E_REQUIRE_LIVE is set, but the provider did not answer: ${verdict.detail}`);
    }
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

const runsMaskedBatch =
  provider !== null &&
  MACHINE_TRANSLATION_PROVIDERS.has(provider.id) &&
  !(provider.id === "google-translate" && GOOGLE_BATCH === "unmasked");

describe.skipIf(!runsMaskedBatch)(
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

      const log = await readWireLog(recorder.logPath);
      expect(log).not.toContain(provider.key);
      const records = parseWireLog(log);
      expect(records.filter((record) => record.kind === "request").length).toBeGreaterThan(0);
      expect(records.some((record) => record.kind === "unrecorded")).toBe(false);
      await observeMaskingBilling(provider, records);
    });
  },
);

describe.skipIf(provider?.id !== "google-translate" || GOOGLE_BATCH !== "unmasked")(
  `send the placeholder-bearing batch unmasked (live: ${provider?.id ?? "skipped"})`,
  () => {
    it("sends the same text once with no masking", async () => {
      if (provider === null) {
        return;
      }
      const outcome = await sendUnmaskedGoogleBatch(provider.key, {
        texts: [MASKED_SOURCE],
        source: "en",
        target: MASKED_TARGET.locale,
      });
      expect(outcome).toBe("sent");
      await publishBillingObservation(
        [
          {
            provider: provider.id,
            variant: "unmasked",
            requests: 1,
            texts: [MASKED_SOURCE],
            billedCharacters: "see the Cloud console",
          },
        ],
        GOOGLE_BILLING_NOTE,
      );
    });
  },
);

async function observeMaskingBilling(
  live: ProviderEnv,
  records: readonly WireRecord[],
): Promise<void> {
  if (live.id === "deepl") {
    const bodies = records.flatMap((record) =>
      record.provider === "deepl" && record.kind === "request" ? [record.body] : [],
    );
    const billed = records.flatMap((record) =>
      record.provider === "deepl" && record.kind === "response" ? [record.billedCharacters] : [],
    );
    const rows: BillingRow[] = [
      {
        provider: live.id,
        variant: "masked",
        requests: bodies.length,
        texts: bodies.flatMap(deeplTexts),
        billedCharacters: sumBilled(billed),
      },
      {
        provider: live.id,
        variant: "unmasked",
        requests: 1,
        texts: [MASKED_SOURCE],
        billedCharacters: await deeplBilledCharacters(
          live.key,
          unmaskedDeepLBody(bodies[0] ?? "", [MASKED_SOURCE]),
        ),
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
    ],
    GOOGLE_BILLING_NOTE,
  );
}
