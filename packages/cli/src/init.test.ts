import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { defineConfig, scaffoldingMetadata } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL, type InitDeps, runInit } from "./init.js";
import { captureStreams } from "./test-support.js";

const nonInteractive: InitDeps = { isTty: () => false };

function queuedAsk(answers: string[]): InitDeps {
  let index = 0;
  return {
    isTty: () => true,
    ask: async () => answers[index++] ?? "",
  };
}

describe("runInit", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("scaffolds a deepl config, env example, and gitignore non-interactively", async () => {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir, yes: true, provider: "deepl" },
      cap.streams,
      nonInteractive,
    );

    expect(code).toBe(0);
    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('import { defineConfig } from "@verbatra/cli";');
    expect(config).toContain('id: "deepl"');
    expect(config).toContain("options: {}");
    expect(config).toContain('sourceLocale: "en"');
    expect(config).toContain('targetLocales: ["de"]');
    expect(config).toContain('pattern: "locales/{locale}.json"');
    expect(readFileSync(join(dir, ".env.example"), "utf8").split("\n")).toContain("DEEPL_API_KEY=");
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".env.local");
    expect(gitignore).toContain(".verbatra-local/");
    expect(gitignore).toContain("verbatra.cache.json");
  });

  it("scaffolds a google-translate config, env example, and gitignore non-interactively", async () => {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir, yes: true, provider: "google-translate" },
      cap.streams,
      nonInteractive,
    );

    expect(code).toBe(0);
    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('id: "google-translate"');
    expect(config).toContain("options: {}");
    expect(readFileSync(join(dir, ".env.example"), "utf8").split("\n")).toContain(
      "GOOGLE_TRANSLATE_API_KEY=",
    );
  });

  it("scaffolds an LLM provider with a default model and token limit", async () => {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir, yes: true, provider: "anthropic" },
      cap.streams,
      nonInteractive,
    );

    expect(code).toBe(0);
    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('id: "anthropic"');
    expect(config).toContain('model: "claude-sonnet-4-6"');
    expect(config).toContain("maxTokens: 4096");
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toContain("ANTHROPIC_API_KEY=");
  });

  it("pins each scaffold default model as valid for its provider (compile-time)", () => {
    const anthropic = defineConfig({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: DEFAULT_MODEL.anthropic, maxTokens: 4096 } },
    });
    const openai = defineConfig({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "openai", options: { model: DEFAULT_MODEL.openai, maxOutputTokens: 4096 } },
    });
    const gemini = defineConfig({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "gemini", options: { model: DEFAULT_MODEL.gemini, maxOutputTokens: 4096 } },
    });
    expect([anthropic.provider.id, openai.provider.id, gemini.provider.id]).toEqual([
      "anthropic",
      "openai",
      "gemini",
    ]);
  });

  it("uses maxOutputTokens and the right key for openai and gemini", async () => {
    const capO = captureStreams();
    expect(
      await runInit({ cwd: dir, yes: true, provider: "openai" }, capO.streams, nonInteractive),
    ).toBe(0);
    let config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('id: "openai"');
    expect(config).toContain('model: "gpt-5.4-mini"');
    expect(config).toContain("maxOutputTokens: 4096");
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toContain("OPENAI_API_KEY=");

    const capG = captureStreams();
    expect(
      await runInit(
        { cwd: dir, yes: true, provider: "gemini", force: true },
        capG.streams,
        nonInteractive,
      ),
    ).toBe(0);
    config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('id: "gemini"');
    expect(config).toContain('model: "gemini-2.5-flash"');
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toContain("GEMINI_API_KEY=");
  });

  it("requires --provider non-interactively and rejects unknown providers", async () => {
    const cap1 = captureStreams();
    expect(await runInit({ cwd: dir, yes: true }, cap1.streams, nonInteractive)).toBe(2);
    expect(cap1.err()).toContain("--provider is required");
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);

    const cap2 = captureStreams();
    expect(
      await runInit({ cwd: dir, yes: true, provider: "bogus" }, cap2.streams, nonInteractive),
    ).toBe(2);
    expect(cap2.err()).toContain("unknown provider");
  });

  it("returns 2 when the inputs would produce an invalid config", async () => {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir, yes: true, provider: "deepl", source: "en", targets: "en" },
      cap.streams,
      nonInteractive,
    );

    expect(code).toBe(2);
    expect(cap.err()).toContain("could not scaffold a valid config");
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
  });

  it("detects the format from a single matching dependency", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { "vue-i18n": "^9" } }),
    );
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive);

    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('format: "vue-i18n-json"');
    expect(config).toContain("detected from your dependencies");
  });

  it("falls back to i18next-json with a set-this comment when several deps match", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { i18next: "^23", "vue-i18n": "^9" } }),
    );
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive);

    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('format: "i18next-json"');
    expect(config).toContain("TODO: set your locale file format");
  });

  it("falls back when package.json is missing or malformed", async () => {
    writeFileSync(join(dir, "package.json"), "{ not valid json");
    const cap = captureStreams();
    expect(
      await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive),
    ).toBe(0);
    expect(readFileSync(join(dir, "verbatra.config.ts"), "utf8")).toContain(
      "TODO: set your locale file format",
    );
  });

  it("appends missing gitignore entries idempotently without duplicating", async () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules\n.env\n");
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive);

    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore.match(/^\.env$/gm)?.length).toBe(1);
    expect(gitignore).toContain(".env.local");
    expect(gitignore).toContain(".verbatra-local/");

    const cap2 = captureStreams();
    await runInit(
      { cwd: dir, yes: true, provider: "deepl", force: true },
      cap2.streams,
      nonInteractive,
    );
    expect(cap2.out()).toContain("already ignores");

    const cap3 = captureStreams();
    await runInit(
      { cwd: dir, yes: true, provider: "deepl", force: true },
      cap3.streams,
      nonInteractive,
    );
    const reread = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(reread.match(/^\.verbatra-local\/$/gm)?.length).toBe(1);
  });

  it("scaffolds .verbatra-local/ into a freshly created .gitignore", async () => {
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive);
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".verbatra-local/");
  });

  it("skips existing files without --force and overwrites with it", async () => {
    const cap1 = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap1.streams, nonInteractive);
    const original = readFileSync(join(dir, "verbatra.config.ts"), "utf8");

    const cap2 = captureStreams();
    const skipCode = await runInit(
      { cwd: dir, yes: true, provider: "anthropic" },
      cap2.streams,
      nonInteractive,
    );
    expect(skipCode).toBe(0);
    expect(cap2.out()).toContain("skipped verbatra.config.ts");
    expect(readFileSync(join(dir, "verbatra.config.ts"), "utf8")).toBe(original);

    const cap3 = captureStreams();
    await runInit(
      { cwd: dir, yes: true, provider: "anthropic", force: true },
      cap3.streams,
      nonInteractive,
    );
    expect(cap3.out()).toContain("overwrote verbatra.config.ts");
    expect(readFileSync(join(dir, "verbatra.config.ts"), "utf8")).toContain('id: "anthropic"');
  });

  it("prompts interactively, applying defaults on empty answers", async () => {
    const cap = captureStreams();
    const code = await runInit({ cwd: dir }, cap.streams, queuedAsk(["deepl", "", "", ""]));

    expect(code).toBe(0);
    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('id: "deepl"');
    expect(config).toContain('sourceLocale: "en"');
    expect(config).toContain('targetLocales: ["de"]');
  });

  it("uses interactive answers when provided", async () => {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir },
      cap.streams,
      queuedAsk(["anthropic", "fr", "es, it", "i18n/{locale}.json"]),
    );

    expect(code).toBe(0);
    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('sourceLocale: "fr"');
    expect(config).toContain('targetLocales: ["es","it"]');
    expect(config).toContain('pattern: "i18n/{locale}.json"');
    expect(config).toContain('id: "anthropic"');
  });

  it("defaults the working directory to process.cwd() when --cwd is omitted", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const cap = captureStreams();
    const code = await runInit({ yes: true, provider: "deepl" }, cap.streams, nonInteractive);

    expect(code).toBe(0);
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(true);
  });

  it("detects the format from devDependencies when dependencies is absent", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ devDependencies: { "next-intl": "^3" } }),
    );
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive);
    expect(readFileSync(join(dir, "verbatra.config.ts"), "utf8")).toContain(
      'format: "next-intl-json"',
    );
  });

  it("appends to an empty .gitignore", async () => {
    writeFileSync(join(dir, ".gitignore"), "");
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive);
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".env.local");
  });

  it("inserts a newline before appending when the .gitignore lacks a trailing one", async () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules");
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive);
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain("node_modules\n");
    expect(gitignore.split("\n")).toContain(".env");
  });

  it("lists every supported format in the undetected format comment", async () => {
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "deepl" }, cap.streams, nonInteractive);
    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain(
      `// TODO: set your locale file format (one of: ${scaffoldingMetadata.supportedFormats.join(", ")}).`,
    );
    for (const format of scaffoldingMetadata.supportedFormats) {
      expect(config).toContain(format);
    }
  });
});

describe("init metadata derivation", () => {
  it("derives provider env-var names from the SDK scaffolding metadata", () => {
    expect(scaffoldingMetadata.providerEnv).toEqual({
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      gemini: "GEMINI_API_KEY",
      deepl: "DEEPL_API_KEY",
      "google-translate": "GOOGLE_TRANSLATE_API_KEY",
    });
  });

  it("derives the default scaffold models from the SDK scaffolding metadata", () => {
    expect(DEFAULT_MODEL).toBe(scaffoldingMetadata.scaffoldModels);
    expect(DEFAULT_MODEL).toEqual({
      anthropic: "claude-sonnet-4-6",
      openai: "gpt-5.4-mini",
      gemini: "gemini-2.5-flash",
    });
  });

  it("keeps every detectable format id a member of the canonical supported formats", () => {
    for (const id of ["i18next-json", "vue-i18n-json", "next-intl-json", "ngx-translate-json"]) {
      expect(scaffoldingMetadata.supportedFormats).toContain(id);
    }
  });
});
