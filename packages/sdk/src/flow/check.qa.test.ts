import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { check } from "./check.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], ...overrides });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown>>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, obj] of Object.entries(targets)) {
    await writeJsonFile(join(dir, "locales", `${locale}.json`), obj);
  }
  return dir;
}

describe("check: qa report", () => {
  it("adds no qa report unless asked", async () => {
    const dir = await project({ a: "Hello {{name}}" }, { de: { a: "Hallo" }, fr: {} });

    const summary = await check({ config: cfg(), cwd: dir });

    expect(summary.qa).toBeUndefined();
    expect(summary.locales.every((locale) => locale.qa === undefined)).toBe(true);
  });

  it("reports a hand-broken placeholder as an error naming the dropped and invented tokens", async () => {
    const dir = await project(
      { greeting: "Hello {{name}}", title: "Settings" },
      { de: { greeting: "Hallo {{nom}}", title: "Einstellungen" }, fr: {} },
    );

    const summary = await check({ config: cfg(), cwd: dir, qa: true });

    expect(summary.locales[0]?.qa).toEqual({
      checked: 2,
      errors: 1,
      warnings: 0,
      findings: [
        {
          key: "greeting",
          severity: "error",
          reason: "placeholder",
          details: ["-{{name}}", "+{{nom}}"],
        },
      ],
    });
    expect(summary.qa).toEqual({ errors: 1, warnings: 0, invalidSourceKeys: [] });
  });

  it("writes nothing on the qa path, even with findings of both severities", async () => {
    const dir = await project(
      { greeting: "Hello {{name}}", copy: "Delete account" },
      { de: { greeting: "Hallo", copy: "Delete account" }, fr: {} },
    );
    const refuse = (what: string) => async (): Promise<never> => {
      throw new Error(`check --qa must not ${what}`);
    };
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: refuse("write a file"),
      writeBytes: refuse("write bytes"),
      createExclusive: refuse("create a file"),
      deleteFile: refuse("delete a file"),
    });

    const summary = await check({ config: cfg(), cwd: dir, qa: true }, { fs });

    expect(summary.qa).toMatchObject({ errors: 1, warnings: 1 });
  });

  it("reports hand-broken inline markup as an error naming the offending tags", async () => {
    const dir = await project(
      { terms: "Read the <b>terms</b>" },
      { de: { terms: "Lies die <i>Bedingungen</i>" }, fr: {} },
    );

    const summary = await check({ config: cfg(), cwd: dir, qa: true });

    expect(summary.locales[0]?.qa?.findings).toEqual([
      {
        key: "terms",
        severity: "error",
        reason: "markup",
        details: ["-</b>", "-<b>", "+</i>", "+<i>"],
      },
    ]);
  });

  it("reports a blank value for a source with text as an empty error, and leaves inSync alone", async () => {
    const dir = await project({ a: "Save" }, { de: { a: "" }, fr: { a: "Enregistrer" } });

    const summary = await check({ config: cfg(), cwd: dir, qa: true });

    expect(summary.inSync).toBe(true);
    expect(summary.locales[0]?.qa?.findings).toEqual([
      { key: "a", severity: "error", reason: "empty" },
    ]);
    expect(summary.locales[1]?.qa).toMatchObject({ checked: 1, errors: 0, findings: [] });
  });

  it("reports the review reasons of a value that passes the gate as warnings", async () => {
    const dir = await project(
      {
        copy: "Delete account",
        long: "This is a reasonably long sentence.",
        term: "Open the dashboard",
        budget: "Save",
      },
      {
        de: {
          copy: "Delete account",
          long: "Ja",
          term: "Die Übersicht öffnen",
          budget: "Speichern",
        },
        fr: {},
      },
    );

    const summary = await check({
      config: cfg({ glossary: { dashboard: "Dashboard" }, maxLength: { budget: 5 } }),
      cwd: dir,
      qa: true,
    });

    expect(summary.locales[0]?.qa?.findings).toEqual([
      { key: "budget", severity: "warning", reason: "MAX_LENGTH_EXCEEDED" },
      { key: "copy", severity: "warning", reason: "EQUALS_SOURCE" },
      { key: "long", severity: "warning", reason: "LENGTH_RATIO_OUTLIER" },
      { key: "term", severity: "warning", reason: "GLOSSARY_TERM_MISSED" },
    ]);
    expect(summary.qa).toMatchObject({ errors: 0, warnings: 4 });
  });

  it("skips the review reasons entirely at severity error", async () => {
    const dir = await project(
      { copy: "Delete account", greeting: "Hi {{name}}" },
      { de: { copy: "Delete account", greeting: "Hallo" }, fr: {} },
    );

    const summary = await check({ config: cfg(), cwd: dir, qa: true, qaSeverity: "error" });

    expect(summary.locales[0]?.qa?.findings.map((finding) => finding.severity)).toEqual(["error"]);
    expect(summary.qa).toMatchObject({ errors: 1, warnings: 0 });
  });

  it("checks only values for source keys: missing and target-only keys are not findings", async () => {
    const dir = await project({ a: "One", b: "Two" }, { de: { a: "Eins", stray: "" }, fr: {} });

    const summary = await check({ config: cfg(), cwd: dir, qa: true });

    expect(summary.locales[0]?.qa).toEqual({ checked: 1, errors: 0, warnings: 0, findings: [] });
    expect(summary.locales[1]?.qa).toEqual({ checked: 0, errors: 0, warnings: 0, findings: [] });
  });

  it("totals findings across every reported locale", async () => {
    const dir = await project({ a: "Hi {{name}}" }, { de: { a: "Hallo" }, fr: { a: "Salut" } });

    const summary = await check({ config: cfg(), cwd: dir, qa: true });

    expect(summary.qa).toMatchObject({ errors: 2, warnings: 0 });
  });

  it("honours the locale filter", async () => {
    const dir = await project({ a: "Hi {{name}}" }, { de: { a: "Hallo" }, fr: { a: "Salut" } });

    const summary = await check({ config: cfg(), cwd: dir, qa: true, locales: ["fr"] });

    expect(summary.locales.map((locale) => locale.locale)).toEqual(["fr"]);
    expect(summary.qa).toMatchObject({ errors: 1 });
  });
});

describe("check: qa report on plurals and ICU", () => {
  it("checks an i18next plural form the target language adds against the source's other form", async () => {
    const dir = await project(
      { items_one: "{{count}} item", items_other: "{{count}} items" },
      {
        ru: {
          items_one: "{{count}} элемент",
          items_few: "элемента",
          items_many: "{{count}} элементов",
          items_other: "{{count}} элемента",
        },
      },
    );

    const summary = await check({ config: cfg({ targetLocales: ["ru"] }), cwd: dir, qa: true });

    expect(summary.locales[0]?.qa).toMatchObject({
      checked: 4,
      errors: 1,
      findings: [{ key: "items_few", severity: "error", reason: "placeholder" }],
    });
  });

  it("does not count a plural form the target language needs but the file lacks yet", async () => {
    const dir = await project(
      { items_one: "{{count}} item", items_other: "{{count}} items" },
      { ru: { items_one: "{{count}} элемент", items_other: "{{count}} элемента" } },
    );

    const summary = await check({ config: cfg({ targetLocales: ["ru"] }), cwd: dir, qa: true });

    expect(summary.locales[0]?.qa).toEqual({ checked: 2, errors: 0, warnings: 0, findings: [] });
  });

  it("reports ICU plural arms that do not fit the target language, naming each wrong arm", async () => {
    const dir = await project(
      { files: "{count, plural, one {# file} other {# files}}" },
      { ru: { files: "{count, plural, one {# файл} other {# файлов}}" } },
    );

    const summary = await check({
      config: cfg({ format: "next-intl-json", targetLocales: ["ru"] }),
      cwd: dir,
      qa: true,
    });

    const finding = summary.locales[0]?.qa?.findings[0];
    expect(finding).toMatchObject({ key: "files", severity: "error", reason: "icu" });
    expect(finding?.severity === "error" ? finding.details : undefined).not.toHaveLength(0);
  });

  it("skips keys whose source is not valid ICU and lists them once", async () => {
    const dir = await project(
      { broken: "{count, plural, one {x}", fine: "Fine" },
      { de: { broken: "{kaputt", fine: "Gut" } },
    );

    const summary = await check({
      config: cfg({ format: "next-intl-json", targetLocales: ["de"] }),
      cwd: dir,
      qa: true,
    });

    expect(summary.locales[0]?.qa).toMatchObject({ checked: 1, errors: 0 });
    expect(summary.qa?.invalidSourceKeys).toEqual(["broken"]);
  });
});

describe("check: qa report against a per-locale glossary", () => {
  it("holds each locale to its own glossary translation and forbidden renderings", async () => {
    const dir = await project(
      { title: "Open the Dashboard", brand: "verbatra help" },
      {
        de: { title: "Öffne die Instrumententafel", brand: "verbatra Hilfe" },
        fr: { title: "Ouvre le tableau de bord", brand: "Aide de Verbatra" },
      },
    );
    const glossary = {
      version: 2 as const,
      terms: [
        {
          source: "Dashboard",
          targets: { de: "Übersicht", fr: "Tableau de bord" },
          forbidden: { de: ["Instrumententafel"] },
        },
      ],
      doNotTranslate: ["verbatra"],
    };

    const summary = await check({ config: cfg({ glossary }), cwd: dir, qa: true });

    const findings = Object.fromEntries(
      summary.locales.map((locale) => [locale.locale, locale.qa?.findings]),
    );
    expect(findings.de).toEqual([
      { key: "title", severity: "warning", reason: "GLOSSARY_TERM_MISSED" },
      { key: "title", severity: "warning", reason: "GLOSSARY_FORBIDDEN_TERM" },
    ]);
    expect(findings.fr).toEqual([
      { key: "brand", severity: "warning", reason: "GLOSSARY_TERM_MISSED" },
    ]);
  });
});
