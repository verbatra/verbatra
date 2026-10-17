import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldingMetadata } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type InitDeps, runInit } from "./init.js";
import { DEFAULT_LAYOUTS } from "./init-config.js";
import { captureStreams, parseEnvelope } from "./test-support.js";

const nonInteractive: InitDeps = { isTty: () => false };

function queuedAsk(answers: readonly string[]): InitDeps {
  let index = 0;
  return { isTty: () => true, ask: async () => answers[index++] ?? "" };
}

interface ScaffoldedFiles {
  readonly pattern: string;
  readonly localeStyle?: string;
}

describe("runInit: format-appropriate defaults", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-defaults-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function scaffold(opts: Record<string, unknown>, deps: InitDeps = nonInteractive) {
    const cap = captureStreams();
    const code = await runInit({ cwd: dir, ...opts }, cap.streams, deps);
    return { code, out: cap.out(), err: cap.err() };
  }

  it("has a default layout for every supported format", () => {
    expect(Object.keys(DEFAULT_LAYOUTS).sort()).toEqual(
      [...scaffoldingMetadata.supportedFormats].sort(),
    );
  });

  it.each([
    ["yaml", "locales/{locale}.yml", undefined],
    ["xliff", "locales/{locale}.xlf", undefined],
    ["properties", "src/main/resources/messages_{locale}.properties", "posix"],
    ["android-xml", "app/src/main/res/{locale}/strings.xml", "android"],
    ["apple-strings", "{locale}.lproj/Localizable.strings", undefined],
    ["apple-xcstrings", "{locale}Localizable.xcstrings", undefined],
    ["gettext-po", "locales/{locale}/LC_MESSAGES/messages.po", "posix"],
    ["arb", "lib/l10n/app_{locale}.arb", "posix"],
    ["resx", "Resources/Strings.{locale}.resx", undefined],
    ["ini", "locales/{locale}.ini", undefined],
    ["next-intl-json", "messages/{locale}.json", undefined],
  ])(
    "scaffolds --format %s with the pattern %s and locale style %s",
    async (format, pattern, style) => {
      const { code, out } = await scaffold({ provider: "deepl", format, yes: true, json: true });

      expect(code).toBe(0);
      const envelope = parseEnvelope(out);
      const files = (envelope.ok ? envelope.result : {}) as { config: { files: ScaffoldedFiles } };
      expect(files.config.files).toEqual(
        style === undefined ? { pattern } : { pattern, localeStyle: style },
      );
    },
  );

  it("offers the chosen format's pattern at the prompt", async () => {
    const questions: string[] = [];
    const deps: InitDeps = {
      isTty: () => true,
      ask: async (question) => {
        questions.push(question);
        return question.startsWith("Provider")
          ? "deepl"
          : question.startsWith("Locale file format")
            ? "yaml"
            : "";
      },
    };

    expect((await scaffold({}, deps)).code).toBe(0);
    expect(questions).toContain("Locale file pattern [locales/{locale}.yml]: ");
    expect(readFileSync(join(dir, "verbatra.config.ts"), "utf8")).toContain(
      'pattern: "locales/{locale}.yml"',
    );
  });

  it("keeps no locale style when a flag names a pattern other than the default", async () => {
    const { out } = await scaffold({
      provider: "deepl",
      format: "properties",
      path: "i18n/messages_{locale}.properties",
      yes: true,
      json: true,
    });
    const envelope = parseEnvelope(out);
    const result = (envelope.ok ? envelope.result : {}) as { config: { files: ScaffoldedFiles } };
    expect(result.config.files).toEqual({ pattern: "i18n/messages_{locale}.properties" });
  });
});

describe("runInit: prompts, flags, and messages", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-polish-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function scaffold(opts: Record<string, unknown>, deps: InitDeps = nonInteractive) {
    const cap = captureStreams();
    const code = await runInit({ cwd: dir, ...opts }, cap.streams, deps);
    return { code, out: cap.out(), err: cap.err() };
  }

  it("treats a format accepted at the prompt as chosen, leaving no TODO and no detection step", async () => {
    const { code, out } = await scaffold({}, queuedAsk(["deepl"]));

    expect(code).toBe(0);
    expect(readFileSync(join(dir, "verbatra.config.ts"), "utf8")).not.toContain("TODO");
    expect(out).not.toContain("found no locale file");
  });

  it("still marks a format taken by --yes as a default to check", async () => {
    const { out } = await scaffold({ provider: "deepl", yes: true });

    expect(readFileSync(join(dir, "verbatra.config.ts"), "utf8")).toContain("TODO");
    expect(out).toContain("found no locale file");
  });

  it.each([
    ["targets", "", "--targets <locales> was given an empty value"],
    ["targets", " , ", "--targets names no locale"],
    ["source", "", "--source <locale> was given an empty value"],
    ["format", "", "--format <id> was given an empty value"],
  ])(
    "refuses --%s %j as a usage error rather than taking the default",
    async (flag, value, message) => {
      const { code, err } = await scaffold({ provider: "deepl", yes: true, [flag]: value });

      expect(code).toBe(2);
      expect(err).toContain("[INVALID_OPTION]");
      expect(err).toContain(message);
    },
  );

  it("names an unknown format once", async () => {
    const { code, err } = await scaffold({ provider: "deepl", format: "bogus", yes: true });

    expect(code).toBe(2);
    expect(err.split('Unknown format "bogus"')).toHaveLength(2);
  });

  it("names a config problem shared by the source and a target once", async () => {
    const { code, err } = await scaffold({
      provider: "deepl",
      source: "xx_YY",
      targets: "xx_YY",
      yes: true,
    });

    expect(code).toBe(2);
    expect(err).toContain("[CONFIG_INVALID]");
    expect(err.split('"xx_YY" is not a valid BCP 47 locale code')).toHaveLength(2);
  });

  it("rewrites the .env.example header it wrote when --force switches the provider", async () => {
    await scaffold({ provider: "gemini", yes: true });
    const { code } = await scaffold({ provider: "deepl", yes: true, force: true });

    expect(code).toBe(0);
    const env = readFileSync(join(dir, ".env.example"), "utf8");
    expect(env.split("\n")[0]).toBe(
      "# Copy this file to .env and set your deepl API key. Do not commit your real key.",
    );
    expect(env).toContain("DEEPL_API_KEY=");
    expect(env).not.toContain("gemini API key");
  });

  it("refreshes the header on --force even when the key variable is already named", async () => {
    writeFileSync(
      join(dir, ".env.example"),
      "# Copy this file to .env and set your gemini API key. Do not commit your real key.\r\nDEEPL_API_KEY=\r\n",
    );
    const { out } = await scaffold({ provider: "deepl", yes: true, force: true });

    expect(out).toContain("updated .env.example");
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toBe(
      "# Copy this file to .env and set your deepl API key. Do not commit your real key.\r\nDEEPL_API_KEY=\r\n",
    );
  });

  it("keeps a header the user wrote, and keeps every header without --force", async () => {
    const own = "# our team's secrets template\nGEMINI_API_KEY=\n";
    writeFileSync(join(dir, ".env.example"), own);
    await scaffold({ provider: "gemini", yes: true, force: true });
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toBe(own);

    const scaffolded =
      "# Copy this file to .env and set your deepl API key. Do not commit your real key.\nGEMINI_API_KEY=\n";
    writeFileSync(join(dir, ".env.example"), scaffolded);
    rmSync(join(dir, "verbatra.config.ts"));
    await scaffold({ provider: "gemini", yes: true });
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toBe(scaffolded);
  });
});
