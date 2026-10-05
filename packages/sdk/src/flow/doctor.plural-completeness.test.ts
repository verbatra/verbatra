import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdapterRegistry } from "@verbatra/format-adapters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DoctorResult, doctor } from "./doctor.js";

let projectDir: string;

function androidConfig(targetLocales: readonly string[]): Record<string, unknown> {
  return {
    sourceLocale: "en",
    targetLocales,
    format: "android-xml",
    files: { pattern: "res/{locale}/strings.xml", localeStyle: "android" },
    provider: { id: "none", options: {} },
  };
}

async function writeConfig(config: Record<string, unknown>): Promise<void> {
  await writeFile(join(projectDir, ".verbatrarc.json"), JSON.stringify(config), "utf8");
}

function plurals(names: readonly string[]): string {
  const groups = names.map(
    (name) =>
      `<plurals name="${name}"><item quantity="one">%d</item><item quantity="other">%d</item></plurals>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>${groups.join("")}</resources>\n`;
}

async function writeAndroid(folder: string, content: string): Promise<void> {
  await mkdir(join(projectDir, "res", folder), { recursive: true });
  await writeFile(join(projectDir, "res", folder, "strings.xml"), content, "utf8");
}

function pluralCheck(result: DoctorResult): { readonly status: string; readonly detail: string } {
  const found = result.checks.find((entry) => entry.id === "plural-completeness");
  if (found === undefined) {
    throw new Error("no plural-completeness check");
  }
  return found;
}

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "verbatra-doctor-plurals-"));
  vi.stubEnv("VERBATRA_NETWORK_POLICY", undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(projectDir, { recursive: true, force: true });
});

describe("doctor: the plural-completeness check", () => {
  it("warns and names each plural lacking categories without failing the run", async () => {
    await writeConfig(androidConfig(["pl", "de"]));
    await writeAndroid("values", plurals(["files"]));
    await writeAndroid("values-pl", plurals(["files"]));
    await writeAndroid("values-de", plurals(["files"]));

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(true);
    expect(pluralCheck(result)).toMatchObject({
      status: "warn",
      detail:
        "1 plural lacks CLDR plural categories the target language uses: pl: files (few, many). " +
        "Add the missing forms by hand; verbatra check lists every gap in a plural a target already " +
        "holds and counts a plural it lacks entirely as missing keys.",
    });
  });

  it("reports every plural complete when nothing is missing", async () => {
    await writeConfig(androidConfig(["de"]));
    await writeAndroid("values", plurals(["files"]));
    await writeAndroid("values-de", plurals(["files"]));

    const result = await doctor({ cwd: projectDir });

    expect(pluralCheck(result)).toMatchObject({
      status: "pass",
      detail: "Every target locale holds every CLDR plural category its language uses.",
    });
  });

  it("lists at most ten plurals and counts the rest", async () => {
    const names = Array.from({ length: 12 }, (_, index) => `p${String(index).padStart(2, "0")}`);
    await writeConfig(androidConfig(["pl"]));
    await writeAndroid("values", plurals(names));
    await writeAndroid("values-pl", plurals(names));

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toMatch(/^12 plurals lack /);
    expect(detail).toContain("pl: p09 (few, many); and 2 more.");
    expect(detail).not.toContain("p10");
  });

  it("names the ICU argument of an incomplete ICU plural", async () => {
    await writeConfig({
      ...androidConfig(["pl"]),
      format: "next-intl-json",
      files: { pattern: "messages/{locale}.json" },
    });
    await mkdir(join(projectDir, "messages"));
    const message = JSON.stringify({ files: "{count, plural, one {#} other {#}}" });
    await writeFile(join(projectDir, "messages", "en.json"), message, "utf8");
    await writeFile(join(projectDir, "messages", "pl.json"), message, "utf8");

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toContain("pl: files {count} (few, many)");
  });

  it("skips a format without CLDR plural forms and says so", async () => {
    await writeConfig({
      ...androidConfig(["pl"]),
      format: "properties",
      files: { pattern: "i18n/messages_{locale}.properties" },
    });

    const result = await doctor({ cwd: projectDir });

    expect(pluralCheck(result)).toMatchObject({
      status: "skipped",
      detail: 'Not checked: the "properties" format does not store plural forms by CLDR category.',
    });
  });

  it("skips the check when the format resolves to no adapter", async () => {
    await writeConfig(androidConfig(["pl"]));

    const result = await doctor({ cwd: projectDir }, { adapterRegistry: new AdapterRegistry() });

    expect(pluralCheck(result)).toMatchObject({
      status: "skipped",
      detail: "Not checked: the configured format resolves to no adapter.",
    });
  });

  it("warns and names a file it could not read instead of failing", async () => {
    await writeConfig(androidConfig(["pl"]));

    const result = await doctor({ cwd: projectDir });

    expect(pluralCheck(result).status).toBe("warn");
    expect(pluralCheck(result).detail).toMatch(
      /^Not checked: The source locale file was not found/,
    );
  });

  it("counts a plural a target with no file yet would lack after a run", async () => {
    await writeConfig(androidConfig(["pl", "de"]));
    await writeAndroid("values", plurals(["files"]));

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toBe(
      "1 plural lacks CLDR plural categories the target language uses: pl: files (few, many). " +
        "Add the missing forms by hand; verbatra check lists every gap in a plural a target already " +
        "holds and counts a plural it lacks entirely as missing keys.",
    );
  });

  it("counts a plural the target file lacks entirely next to its committed gaps", async () => {
    await writeConfig(androidConfig(["pl"]));
    await writeAndroid("values", plurals(["apples", "files"]));
    await writeAndroid("values-pl", plurals(["files"]));

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toContain("pl: apples (few, many); pl: files (few, many)");
  });

  it("reports the i18next gap translate warns about for a locale with no file", async () => {
    await writeConfig(i18nextConfig({ provider: { id: "none", options: {} } }));
    await writeI18nextSource();

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toContain("fr: items (many)");
  });

  it("leaves out an absent plural that plural generation will fill", async () => {
    await writeConfig(
      i18nextConfig({
        generatePlurals: true,
        provider: { id: "anthropic", options: { model: "m", maxTokens: 256 } },
      }),
    );
    await writeI18nextSource();

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toBe("Every target locale holds every CLDR plural category its language uses.");
  });

  it("still projects an absent plural when generation is on but the provider is no LLM", async () => {
    await writeConfig(
      i18nextConfig({ generatePlurals: true, provider: { id: "deepl", options: {} } }),
    );
    await writeI18nextSource();

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toContain("fr: items (many)");
  });

  it("counts a blank source form as absent from the projected target", async () => {
    await writeConfig(i18nextConfig({ provider: { id: "none", options: {} } }));
    await writeI18nextSource({ items_one: "", items_other: "{{count}} items" });

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toContain("fr: items (one, many)");
  });

  it("leaves out only the gaps generation fills when a source form is blank", async () => {
    await writeConfig(
      i18nextConfig({
        generatePlurals: true,
        provider: { id: "anthropic", options: { model: "m", maxTokens: 256 } },
      }),
    );
    await writeI18nextSource({ items_one: "", items_other: "{{count}} items" });

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toContain("fr: items (one)");
    expect(detail).not.toContain("many");
  });

  it("reports every category of a plural whose source forms are all blank, generation or not", async () => {
    await writeConfig(
      i18nextConfig({
        generatePlurals: true,
        provider: { id: "anthropic", options: { model: "m", maxTokens: 256 } },
      }),
    );
    await writeI18nextSource({ items_one: "", items_other: " " });

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toContain("fr: items (one, many, other)");
    expect(detail).toContain("de: items (one, other)");
  });

  it("does not project an ICU plural, whose arms a run translates for the target", async () => {
    await writeConfig({
      ...androidConfig(["pl"]),
      format: "next-intl-json",
      files: { pattern: "messages/{locale}.json" },
    });
    await mkdir(join(projectDir, "messages"));
    const message = JSON.stringify({ files: "{count, plural, one {#} other {#}}" });
    await writeFile(join(projectDir, "messages", "en.json"), message, "utf8");

    const detail = pluralCheck(await doctor({ cwd: projectDir })).detail;

    expect(detail).toBe("Every target locale holds every CLDR plural category its language uses.");
  });
});

function i18nextConfig(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    ...overrides,
  };
}

async function writeI18nextSource(
  values: Record<string, string> = { items_one: "{{count}} item", items_other: "{{count}} items" },
): Promise<void> {
  await mkdir(join(projectDir, "locales"));
  const source = JSON.stringify(values);
  await writeFile(join(projectDir, "locales", "en.json"), source, "utf8");
}
