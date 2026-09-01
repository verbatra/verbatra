import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import {
  createDefaultRegistry,
  createNextIntlJsonAdapter,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { createBudgetTracker } from "./budget.js";
import { editEntry } from "./edit-entry.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { runLocale } from "./locale-run.js";
import { retranslateEntry } from "./retranslate-entry.js";
import { importLocale } from "./workbook/import-locale.js";

interface Case {
  readonly name: string;
  readonly adapter: FormatAdapter;
  readonly format: VerbatraConfig["format"];
  readonly sourceValue: string;
  readonly candidateValue: string;
  readonly expected: ReturnType<typeof gateCandidateValue>;
}

function i18nextAdapter(): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("i18next adapter did not resolve");
  }
  return resolution.adapter;
}

const nextIntl = createNextIntlJsonAdapter();

const cases: readonly Case[] = [
  {
    name: "accepted: placeholders match",
    adapter: i18nextAdapter(),
    format: "i18next-json",
    sourceValue: "Hello {{name}}",
    candidateValue: "Hallo {{name}}",
    expected: { accepted: true },
  },
  {
    name: "rejected: a source placeholder is missing",
    adapter: i18nextAdapter(),
    format: "i18next-json",
    sourceValue: "Hello {{name}}",
    candidateValue: "Hallo",
    expected: { accepted: false, reason: "placeholder" },
  },
  {
    name: "rejected: well-formed placeholders but invalid ICU syntax",
    adapter: nextIntl,
    format: "next-intl-json",
    sourceValue: "Hello world",
    candidateValue: "Hallo {name",
    expected: { accepted: false, reason: "icu" },
  },
  {
    name: "rejected: a single-brace token is altered",
    adapter: i18nextAdapter(),
    format: "i18next-json",
    sourceValue: "Hello {name}",
    candidateValue: "Ciao {nome}",
    expected: { accepted: false, reason: "placeholder" },
  },
  {
    name: "rejected: a single-brace token is fabricated beside a kept one",
    adapter: i18nextAdapter(),
    format: "i18next-json",
    sourceValue: "Order {orderId}",
    candidateValue: "Ordine {orderId} {evilInjected}",
    expected: { accepted: false, reason: "placeholder" },
  },
  {
    name: "rejected: a single-brace token is injected into a token-free source",
    adapter: i18nextAdapter(),
    format: "i18next-json",
    sourceValue: "Your balance is available",
    candidateValue: "Il tuo saldo e {stolenSecret}",
    expected: { accepted: false, reason: "placeholder" },
  },
  {
    name: "accepted: a single-brace token dropped from the source is not judged",
    adapter: i18nextAdapter(),
    format: "i18next-json",
    sourceValue: "You have {count} items",
    candidateValue: "Hai articoli nel carrello",
    expected: { accepted: true },
  },
];

describe.each(cases)("gateCandidateValue agreement: $name", (testCase) => {
  it("gateCandidateValue itself returns the expected decision", () => {
    const sourceEntry = {
      key: "greeting",
      namespace: "en",
      value: testCase.sourceValue,
      placeholders: testCase.adapter.extractPlaceholders(testCase.sourceValue),
      isPlural: false,
    };
    expect(gateCandidateValue(sourceEntry, testCase.candidateValue, testCase.adapter)).toEqual(
      testCase.expected,
    );
  });

  it("runLocale (the provider-translation path) agrees", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: testCase.sourceValue });
    const sourceResource = (await testCase.adapter.read(join(dir, "locales", "en.json"), "en"))
      .resource;
    const provider = makeStubProvider({ translate: () => testCase.candidateValue }).provider;

    const { summary, lockEntries } = await runLocale({
      source: sourceResource,
      sourceInvalidIcuKeys: [],
      baseline: new Map(),
      adapter: testCase.adapter,
      provider,
      cwd: dir,
      resolver: createLocalePathResolver(dir, {
        sourceLocale: "en",
        targetLocales: ["de"],
        format: testCase.format,
        files: { pattern: "locales/{locale}.json" },
      }),
      sourceLocale: "en",
      targetLocale: "de",
      format: testCase.format,
      glossary: undefined,
      tone: undefined,
      prune: false,
      generatePlurals: false,
      maxBatchSize: 50,
      fs: defaultFs,
      budget: createBudgetTracker(undefined, "warn"),
    });

    if (testCase.expected.accepted) {
      expect(summary.translated).toEqual(["greeting"]);
      expect(lockEntries.greeting).toBeDefined();
    } else {
      expect(summary.integrityMismatches).toEqual(["greeting"]);
      expect(lockEntries.greeting).toBeUndefined();
    }
  });

  it("importLocale (workbook import's judge()) agrees", () => {
    const sourceEntry = {
      key: "greeting",
      namespace: "en",
      value: testCase.sourceValue,
      placeholders: testCase.adapter.extractPlaceholders(testCase.sourceValue),
      isPlural: false,
    };
    const source = {
      locale: "en",
      namespace: "en",
      format: testCase.format,
      entries: new Map([["greeting", sourceEntry]]),
    };
    const target = { locale: "de", namespace: "en", format: testCase.format, entries: new Map() };
    const result = importLocale({
      sheet: {
        locale: "de",
        rows: [
          {
            key: "greeting",
            source: testCase.sourceValue,
            currentTarget: "",
            status: "new",
            sourceHash: contentHash(sourceEntry),
            translation: testCase.candidateValue,
            context: "",
            reviewStatus: "ok",
            reviewReasons: "",
          },
        ],
      },
      source,
      target,
      baseline: new Map(),
      adapter: testCase.adapter,
      sourceInvalidIcuKeys: [],
      malformedRows: [],
      duplicateKeys: [],
    });

    if (testCase.expected.accepted) {
      expect(result.accepted.has("greeting")).toBe(true);
    } else {
      expect(result.accepted.has("greeting")).toBe(false);
      expect(result.summary.integrityMismatches).toEqual(["greeting"]);
    }
  });

  it("retranslateEntry agrees", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: testCase.sourceValue });
    const config = baseConfig({
      targetLocales: ["de"],
      format: testCase.format,
      sourceLocale: "en",
    });
    const provider = makeStubProvider({ translate: () => testCase.candidateValue }).provider;

    const result = await retranslateEntry(
      { config, cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => provider },
    );

    expect(result.accepted).toBe(testCase.expected.accepted);
    if (!testCase.expected.accepted) {
      expect(result).toMatchObject({ reason: testCase.expected.reason });
      const de = await readJsonFile(join(dir, "locales", "de.json")).catch(() => undefined);
      expect(de).toBeUndefined();
    }
  });

  it("editEntry (the hand-typed Studio path) agrees", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: testCase.sourceValue });
    const config = baseConfig({
      targetLocales: ["de"],
      format: testCase.format,
      sourceLocale: "en",
    });

    const result = await editEntry({
      config,
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: testCase.candidateValue,
    });

    expect(result.accepted).toBe(testCase.expected.accepted);
    const de = await readJsonFile(join(dir, "locales", "de.json")).catch(() => undefined);
    if (testCase.expected.accepted) {
      expect(de).toEqual({ greeting: testCase.candidateValue });
    } else {
      expect(result).toMatchObject({ reason: testCase.expected.reason });
      expect(de).toBeUndefined();
    }
  });
});
