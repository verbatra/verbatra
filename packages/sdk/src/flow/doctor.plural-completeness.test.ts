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
  it("names each plural lacking categories without failing the run", async () => {
    await writeConfig(androidConfig(["pl", "de"]));
    await writeAndroid("values", plurals(["files"]));
    await writeAndroid("values-pl", plurals(["files"]));
    await writeAndroid("values-de", plurals(["files"]));

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(true);
    expect(pluralCheck(result)).toMatchObject({
      status: "pass",
      detail:
        "1 plural lacks CLDR plural categories the target language uses: pl: files (few, many). " +
        "Add the missing forms by hand; verbatra check lists them all.",
    });
  });

  it("reports every plural complete when nothing is missing", async () => {
    await writeConfig(androidConfig(["de"]));
    await writeAndroid("values", plurals(["files"]));
    await writeAndroid("values-de", plurals(["files"]));

    const result = await doctor({ cwd: projectDir });

    expect(pluralCheck(result).detail).toBe(
      "Every target locale holds every CLDR plural category its language uses.",
    );
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

  it("says a format without CLDR plural forms is not checked", async () => {
    await writeConfig({
      ...androidConfig(["pl"]),
      format: "properties",
      files: { pattern: "i18n/messages_{locale}.properties" },
    });

    const result = await doctor({ cwd: projectDir });

    expect(pluralCheck(result).detail).toBe(
      'Not checked: the "properties" format does not store plural forms by CLDR category.',
    );
  });

  it("says the check did not run when the format resolves to no adapter", async () => {
    await writeConfig(androidConfig(["pl"]));

    const result = await doctor({ cwd: projectDir }, { adapterRegistry: new AdapterRegistry() });

    expect(pluralCheck(result)).toMatchObject({
      status: "pass",
      detail: "Not checked: the configured format resolves to no adapter.",
    });
  });

  it("names a file it could not read instead of failing", async () => {
    await writeConfig(androidConfig(["pl"]));

    const result = await doctor({ cwd: projectDir });

    expect(pluralCheck(result).status).toBe("pass");
    expect(pluralCheck(result).detail).toMatch(
      /^Not checked: The source locale file was not found/,
    );
  });
});
