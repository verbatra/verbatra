import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type ProjectDetection, verbatraConfigSchema } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type InitDeps, runInit } from "./init.js";
import { captureStreams, parseEnvelope } from "./test-support.js";

const nonInteractive: InitDeps = { isTty: () => false };
const terminal: InitDeps = { isTty: () => true, ask: async () => "" };

interface InitJson {
  readonly configPath: string;
  readonly files: readonly { readonly path: string; readonly action: string }[];
  readonly config: {
    readonly sourceLocale: string;
    readonly targetLocales: readonly string[];
    readonly format: string;
    readonly files: { readonly pattern: string; readonly localeStyle?: string };
    readonly provider: { readonly id: string; readonly options: Record<string, unknown> };
  };
  readonly sources: Record<string, string>;
  readonly apiKeyEnvVar: string | null;
  readonly detection: {
    readonly format: { readonly id: string; readonly from: string } | null;
    readonly layout: {
      readonly pattern: string;
      readonly sourceLocale: string | null;
      readonly unqualifiedSourceFile: string | null;
    } | null;
    readonly confidence: string;
    readonly reasons: readonly string[];
  };
  readonly nextSteps: readonly { readonly description: string; readonly command: string | null }[];
}

function evaluateRenderedConfig(text: string): unknown {
  const body = text
    .split("\n")
    .filter((line) => !line.startsWith("import "))
    .join("\n")
    .replace("export default defineConfig(", "return (");
  return (new Function(body) as () => unknown)();
}

describe("runInit for agents", () => {
  let dir: string;

  function write(relativePath: string, content: string): void {
    const path = join(dir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  function readConfig(): string {
    return readFileSync(join(dir, "verbatra.config.ts"), "utf8");
  }

  async function initJson(
    opts: Record<string, unknown>,
    deps: InitDeps = nonInteractive,
  ): Promise<{ code: number; out: string; err: string }> {
    const cap = captureStreams();
    const code = await runInit({ cwd: dir, json: true, ...opts }, cap.streams, deps);
    return { code, out: cap.out(), err: cap.err() };
  }

  function successResult(out: string): InitJson {
    const envelope = parseEnvelope(out);
    if (!envelope.ok) {
      throw new Error(`expected success, got ${envelope.code}: ${envelope.message}`);
    }
    expect(envelope.command).toBe("init");
    return envelope.result as InitJson;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-agents-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("scaffolds a yaml project from flags and reports what it wrote as one JSON document", async () => {
    const { code, out, err } = await initJson({
      provider: "gemini",
      format: "yaml",
      path: "i18n/{locale}.yml",
      yes: true,
    });

    expect(code).toBe(0);
    expect(err).toBe("");
    expect(out.trim().split("\n")).toHaveLength(1);
    const result = successResult(out);
    expect(result.configPath).toBe(join(dir, "verbatra.config.ts"));
    expect(result.files).toEqual([
      { path: "verbatra.config.ts", action: "created" },
      { path: ".env.example", action: "created" },
      { path: ".gitignore", action: "created" },
    ]);
    expect(result.config).toMatchObject({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "yaml",
      files: { pattern: "i18n/{locale}.yml" },
      provider: { id: "gemini" },
    });
    expect(result.sources).toEqual({
      provider: "flag",
      format: "flag",
      pattern: "flag",
      sourceLocale: "default",
      targetLocales: "default",
    });
    expect(result.apiKeyEnvVar).toBe("GEMINI_API_KEY");
    expect(result.nextSteps.map((step) => step.command)).toEqual([
      null,
      `npx verbatra doctor --cwd ${dir}`,
      `npx verbatra translate --dry-run --json --cwd ${dir}`,
    ]);
    expect(verbatraConfigSchema.safeParse(evaluateRenderedConfig(readConfig())).success).toBe(true);
  });

  it("detects the format, pattern, and locales from existing locale files", async () => {
    write("config/locales/en.yml", "greeting: Hello\n");
    write("config/locales/de.yml", "greeting: Hallo\n");
    write("config/locales/fr.yml", "greeting: Bonjour\n");

    const { code, out } = await initJson({ provider: "deepl" });

    expect(code).toBe(0);
    const result = successResult(out);
    expect(result.config).toMatchObject({
      sourceLocale: "en",
      targetLocales: ["de", "fr"],
      format: "yaml",
      files: { pattern: "config/locales/{locale}.yml" },
    });
    expect(result.sources).toMatchObject({
      format: "files",
      pattern: "detected",
      sourceLocale: "detected",
      targetLocales: "detected",
    });
    expect(result.detection.format).toEqual({ id: "yaml", from: "files" });
    expect(result.detection.confidence).toBe("medium");
    expect(result.detection.layout?.unqualifiedSourceFile).toBeNull();
    expect(result.detection.reasons.length).toBeGreaterThan(0);
    expect(readConfig()).toContain("// The format of your locale files.");
  });

  it("writes the posix locale style it detected", async () => {
    write("src/main/resources/messages_en.properties", "a=A\n");
    write("src/main/resources/messages_pt_BR.properties", "a=B\n");

    const { code, out } = await initJson({ provider: "deepl" });

    expect(code).toBe(0);
    expect(successResult(out).config.files).toEqual({
      pattern: "src/main/resources/messages_{locale}.properties",
      localeStyle: "posix",
    });
    expect(readConfig()).toContain('localeStyle: "posix"');
    const parsed = verbatraConfigSchema.parse(evaluateRenderedConfig(readConfig()));
    expect(parsed.targetLocales).toEqual(["pt-BR"]);
  });

  it("drops a detected locale style when the pattern was changed at the prompt", async () => {
    write("i18n/messages_en.properties", "a=A\n");
    write("i18n/messages_pt_BR.properties", "a=B\n");
    const answers = ["deepl", "", "", "", "translations/{locale}.properties"];
    let index = 0;
    const cap = captureStreams();
    const code = await runInit({ cwd: dir }, cap.streams, {
      isTty: () => true,
      ask: async () => answers[index++] ?? "",
    });

    expect(code).toBe(0);
    expect(readConfig()).not.toContain("localeStyle");
  });

  it("refuses an ambiguous JSON format with the candidates in the envelope", async () => {
    write("locales/en.json", '{"a":"A"}');
    write("locales/de.json", '{"a":"B"}');

    const { code, out, err } = await initJson({ provider: "deepl", yes: true });

    expect(code).toBe(2);
    expect(err).toContain("[FORMAT_AMBIGUOUS]");
    expect(parseEnvelope(out)).toMatchObject({
      ok: false,
      command: "init",
      code: "FORMAT_AMBIGUOUS",
      candidates: ["i18next-json", "vue-i18n-json", "next-intl-json", "ngx-translate-json"],
    });
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
  });

  it("resolves an ambiguous JSON format through --format and keeps the detected layout", async () => {
    write("locales/en.json", '{"a":"A"}');
    write("locales/de.json", '{"a":"B"}');

    const { code, out } = await initJson({ provider: "deepl", format: "next-intl-json" });

    expect(code).toBe(0);
    expect(successResult(out).config).toMatchObject({
      format: "next-intl-json",
      targetLocales: ["de"],
      files: { pattern: "locales/{locale}.json" },
    });
  });

  it("refuses an ambiguous layout with the candidate patterns", async () => {
    write("locales/en/common.yaml", "a: A\n");
    write("locales/de/common.yaml", "a: B\n");
    write("locales/en/auth.yaml", "a: A\n");
    write("locales/de/auth.yaml", "a: B\n");

    const { code, out } = await initJson({ provider: "deepl", yes: true });

    expect(code).toBe(2);
    expect(parseEnvelope(out)).toMatchObject({
      code: "LAYOUT_AMBIGUOUS",
      candidates: ["locales/{locale}/auth.yaml", "locales/{locale}/common.yaml"],
    });
  });

  it("offers the first ambiguous candidate as the default at a terminal", async () => {
    write("locales/en/common.yaml", "a: A\n");
    write("locales/de/common.yaml", "a: B\n");
    write("locales/en/auth.yaml", "a: A\n");
    write("locales/de/auth.yaml", "a: B\n");
    const questions: string[] = [];
    const cap = captureStreams();
    const code = await runInit({ cwd: dir, provider: "deepl" }, cap.streams, {
      isTty: () => true,
      ask: async (question) => {
        questions.push(question);
        return "";
      },
    });

    expect(code).toBe(0);
    expect(questions.at(-1)).toBe("Locale file pattern [locales/{locale}/auth.yaml]: ");
    expect(readConfig()).toContain('pattern: "locales/{locale}/auth.yaml"');
  });

  it("lists every missing flag instead of prompting when stdin is not a terminal", async () => {
    const cap = captureStreams();
    const code = await runInit({ cwd: dir }, cap.streams, nonInteractive);

    expect(code).toBe(2);
    expect(cap.err()).toContain(
      "[MISSING_OPTIONS] Missing --provider <anthropic|openai|gemini|deepl|google-translate|openai-compatible|none>, --format <id>, --source <locale>, --targets <locales>, --path <pattern>.",
    );
    expect(cap.err()).toContain(
      "Or add --yes to accept the default for --format <id>, --source <locale>, --targets <locales>, --path <pattern>.",
    );
  });

  it("offers no --yes hint when only flags without a default are missing", async () => {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir, format: "yaml", source: "en", targets: "de", path: "i18n/{locale}.yaml" },
      cap.streams,
      nonInteractive,
    );

    expect(code).toBe(2);
    expect(cap.err()).toContain("Missing --provider");
    expect(cap.err()).not.toContain("--yes to accept");
  });

  it("reports an ambiguity together with every missing flag in one round trip", async () => {
    write("locales/en.json", "{}");
    write("locales/de.json", "{}");

    const { code, out } = await initJson({});

    expect(code).toBe(2);
    const envelope = parseEnvelope(out) as {
      code?: string;
      message?: string;
      candidates?: string[];
      missing?: string[];
    };
    expect(envelope.code).toBe("FORMAT_AMBIGUOUS");
    expect(envelope.candidates).toHaveLength(4);
    expect(envelope.missing).toEqual([
      "--provider <anthropic|openai|gemini|deepl|google-translate|openai-compatible|none>",
    ]);
    expect(envelope.message).toContain("Also missing --provider");
  });

  it("reports an invalid option together with the other problems and missing flags", async () => {
    const { code, out } = await initJson({ provider: "deepl", model: "m", format: "toml" });

    expect(code).toBe(2);
    const envelope = parseEnvelope(out) as { code?: string; message?: string; missing?: string[] };
    expect(envelope.code).toBe("INVALID_FORMAT");
    expect(envelope.message).toContain("[INVALID_OPTION] --model does not apply");
    expect(envelope.missing).toEqual([
      "--source <locale>",
      "--targets <locales>",
      "--path <pattern>",
    ]);
  });

  it("lists the missing flags in the MISSING_OPTIONS envelope", async () => {
    const { out } = await initJson({ provider: "deepl", format: "yaml" });
    expect(parseEnvelope(out)).toMatchObject({
      code: "MISSING_OPTIONS",
      missing: ["--source <locale>", "--targets <locales>", "--path <pattern>"],
    });
  });

  it.each([
    {
      name: "a Java base bundle",
      files: {
        "src/main/resources/messages.properties": "a=A\n",
        "src/main/resources/messages_de.properties": "a=B\n",
      },
      base: "src/main/resources/messages.properties",
      source: "src/main/resources/messages_en.properties",
    },
    {
      name: "a .NET neutral resource file",
      files: { "Resources/Strings.resx": "<root/>", "Resources/Strings.de.resx": "<root/>" },
      base: "Resources/Strings.resx",
      source: "Resources/Strings.en.resx",
    },
    {
      name: "a gettext template",
      files: {
        "po/app.pot": 'msgid "a"\nmsgstr ""\n',
        "locale/de/LC_MESSAGES/app.po": 'msgid "a"\nmsgstr "b"\n',
      },
      base: "po/app.pot",
      source: "locale/en/LC_MESSAGES/app.po",
    },
  ])(
    "requires --source next to $name, even with --yes, and explains the base file",
    async ({ files, base, source }) => {
      for (const [path, content] of Object.entries(files)) {
        write(path, content);
      }

      const refused = await initJson({ provider: "deepl", yes: true });
      expect(refused.code).toBe(2);
      expect(parseEnvelope(refused.out)).toMatchObject({
        code: "MISSING_OPTIONS",
        missing: ["--source <locale>"],
      });
      expect(refused.err).toContain(
        `--source <locale>: ${base} holds strings under no locale name`,
      );

      const { code, out } = await initJson({ provider: "deepl", yes: true, source: "en" });
      expect(code).toBe(0);
      const result = successResult(out);
      expect(result.config.sourceLocale).toBe("en");
      expect(result.detection.confidence).toBe("medium");
      expect(result.detection.layout?.unqualifiedSourceFile).toBe(base);
      expect(result.nextSteps.map((step) => step.description)).toContain(
        `verbatra reads the en source strings from ${source}, never from ${base}. Rename or copy ${base} to ${source} before the first run.`,
      );
    },
  );

  it("tells the user to keep a base file in step when the source file already exists", async () => {
    write("Resources/Strings.resx", "<root/>");
    write("Resources/Strings.en.resx", "<root/>");
    write("Resources/Strings.de.resx", "<root/>");

    const { code, out } = await initJson({ provider: "deepl", source: "en" });

    expect(code).toBe(0);
    expect(successResult(out).nextSteps.map((step) => step.description)).toContain(
      "verbatra reads the en source strings from Resources/Strings.en.resx, never from Resources/Strings.resx. Keep the two in step, or retire Resources/Strings.resx.",
    );
  });

  it("never prompts under --json, even at a terminal", async () => {
    let asked = false;
    const { code, out } = await initJson(
      {},
      {
        isTty: () => true,
        ask: async () => {
          asked = true;
          return "";
        },
      },
    );

    expect(code).toBe(2);
    expect(asked).toBe(false);
    expect(parseEnvelope(out)).toMatchObject({ ok: false, code: "MISSING_OPTIONS" });
  });

  it("needs no --yes when detection supplies everything but the provider", async () => {
    write("i18n/en.yaml", "a: A\n");
    write("i18n/de.yaml", "a: B\n");

    const { code } = await initJson({ provider: "none" });

    expect(code).toBe(0);
    expect(existsSync(join(dir, ".env.example"))).toBe(false);
  });

  it("names export as the human-only next step", async () => {
    const { out } = await initJson({ provider: "none", yes: true });
    const result = successResult(out);

    expect(result.apiKeyEnvVar).toBeNull();
    expect(result.nextSteps.at(-1)?.command).toContain("npx verbatra export");
    expect(result.nextSteps[0]?.description).toContain("Set format");
  });

  it("scaffolds an openai-compatible provider without writing a key", async () => {
    const { code, out } = await initJson({
      provider: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      yes: true,
    });

    expect(code).toBe(0);
    const result = successResult(out);
    expect(result.config.provider).toEqual({
      id: "openai-compatible",
      options: { baseUrl: "http://localhost:11434/v1", model: "llama3.1", maxOutputTokens: 4096 },
    });
    expect(result.apiKeyEnvVar).toBe("OPENAI_COMPATIBLE_API_KEY");
    expect(result.nextSteps[1]?.description).toContain("only if your server requires a key");
    const envExample = readFileSync(join(dir, ".env.example"), "utf8");
    expect(envExample).toContain("only if your server requires a key");
    expect(envExample.split("\n")).toContain("OPENAI_COMPATIBLE_API_KEY=");
    const parsed = verbatraConfigSchema.parse(evaluateRenderedConfig(readConfig()));
    expect(parsed.provider.id).toBe("openai-compatible");
  });

  it("names a custom key variable for openai-compatible, never its value", async () => {
    const { code } = await initJson({
      provider: "openai-compatible",
      baseUrl: "https://llm.example.com/v1",
      model: "m",
      apiKeyEnvVar: "MY_LLM_KEY",
      yes: true,
    });

    expect(code).toBe(0);
    expect(readConfig()).toContain('apiKeyEnvVar: "MY_LLM_KEY"');
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toContain("set your openai-compatible");
    expect(readFileSync(join(dir, ".env.example"), "utf8").split("\n")).toContain("MY_LLM_KEY=");
  });

  it("prompts for the base URL and model of openai-compatible at a terminal", async () => {
    const answers = ["openai-compatible", "http://localhost:8080/v1", "qwen"];
    let index = 0;
    const cap = captureStreams();
    const code = await runInit({ cwd: dir }, cap.streams, {
      isTty: () => true,
      ask: async () => answers[index++] ?? "",
    });

    expect(code).toBe(0);
    expect(readConfig()).toContain('baseUrl: "http://localhost:8080/v1"');
    expect(readConfig()).toContain('model: "qwen"');
  });

  it("names the unanswered openai-compatible prompts that have no default", async () => {
    const answers = ["openai-compatible", "", ""];
    let index = 0;
    const cap = captureStreams();
    const code = await runInit({ cwd: dir }, cap.streams, {
      isTty: () => true,
      ask: async () => answers[index++] ?? "",
    });

    expect(code).toBe(2);
    expect(cap.err()).toContain(
      "[MISSING_OPTIONS] Missing --base-url <url>, --model <name>. They have no default, so answer the prompt or pass them as flags.",
    );
  });

  it("requires the base URL and model of openai-compatible non-interactively", async () => {
    const { code, err } = await initJson({ provider: "openai-compatible", yes: true });

    expect(code).toBe(2);
    expect(err).toContain("Missing --base-url <url>, --model <name>.");
    expect(err).not.toContain("--yes to accept");
  });

  it.each([
    [
      { provider: "deepl", baseUrl: "http://x" },
      "--base-url applies to --provider openai-compatible only",
    ],
    [
      { provider: "gemini", baseUrl: "http://x", apiKeyEnvVar: "K" },
      "--base-url and --api-key-env-var apply",
    ],
    [{ provider: "deepl", model: "m" }, "--model does not apply to --provider deepl"],
    [
      { provider: "openai-compatible", baseUrl: "http://x", model: "m", apiKeyEnvVar: "BAD NAME" },
      "--api-key-env-var must name an environment variable",
    ],
    [
      {
        provider: "openai-compatible",
        baseUrl: "http://x",
        model: "m",
        apiKeyEnvVar: "gsk_secret123",
      },
      "never the key",
    ],
    [
      { provider: "openai-compatible", baseUrl: "https://host/v1?api-key=secret123", model: "m" },
      "must not carry credentials, a query string, or a fragment",
    ],
    [
      { provider: "openai-compatible", baseUrl: "https://user:secret@host/v1", model: "m" },
      "must not carry credentials",
    ],
  ])("refuses invalid provider flags %j", async (opts, message) => {
    const { code, out, err } = await initJson({ ...opts, yes: true });

    expect(code).toBe(2);
    expect(err).toContain("[INVALID_OPTION]");
    expect(err).toContain(message);
    expect(err).not.toContain("secret");
    expect(out).not.toContain("secret");
    expect(parseEnvelope(out)).toMatchObject({ code: "INVALID_OPTION" });
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
  });

  it("refuses an unsupported base URL through the config schema", async () => {
    const { code, err } = await initJson({
      provider: "openai-compatible",
      baseUrl: "not a url",
      model: "m",
      yes: true,
    });

    expect(code).toBe(2);
    expect(err).toContain("[CONFIG_INVALID]");
  });

  it("uses a --model override for a hosted language-model provider", async () => {
    const { code } = await initJson({ provider: "anthropic", model: "claude-opus-4-1", yes: true });

    expect(code).toBe(0);
    expect(readConfig()).toContain('model: "claude-opus-4-1"');
    expect(readConfig()).not.toContain("A sensible default");
  });

  it("refuses an unknown format with the supported list", async () => {
    const { code, out } = await initJson({ provider: "deepl", format: "toml", yes: true });

    expect(code).toBe(2);
    const envelope = parseEnvelope(out) as {
      readonly code?: string;
      readonly candidates?: string[];
    };
    expect(envelope.code).toBe("INVALID_FORMAT");
    expect(envelope.candidates).toContain("yaml");
  });

  it("is idempotent: a second identical run changes nothing and succeeds", async () => {
    await initJson({ provider: "deepl", yes: true });
    const first = readConfig();

    const { code, out } = await initJson({ provider: "deepl", yes: true });

    expect(code).toBe(0);
    expect(successResult(out).files).toEqual([
      { path: "verbatra.config.ts", action: "unchanged" },
      { path: ".env.example", action: "unchanged" },
      { path: ".gitignore", action: "unchanged" },
    ]);
    expect(readConfig()).toBe(first);
  });

  it("writes the same file whether the format was passed or detected", async () => {
    write("i18n/en.yaml", "a: A\n");
    write("i18n/de.yaml", "a: B\n");
    await initJson({ provider: "deepl", format: "yaml" });

    const { code, out } = await initJson({ provider: "deepl" });

    expect(code).toBe(0);
    expect(successResult(out).files[0]).toEqual({
      path: "verbatra.config.ts",
      action: "unchanged",
    });
  });

  it("reports an overwrite under --force", async () => {
    await initJson({ provider: "deepl", yes: true });

    const { code, out } = await initJson({ provider: "anthropic", yes: true, force: true });

    expect(code).toBe(0);
    expect(successResult(out).files[0]).toEqual({
      path: "verbatra.config.ts",
      action: "overwritten",
    });
  });

  it("appends the key variable to an existing .env.example that lacks it", async () => {
    writeFileSync(join(dir, ".env.example"), "DATABASE_URL=");

    const { out } = await initJson({ provider: "deepl", yes: true });

    expect(successResult(out).files[1]).toEqual({ path: ".env.example", action: "updated" });
    expect(readFileSync(join(dir, ".env.example"), "utf8")).toBe("DATABASE_URL=\nDEEPL_API_KEY=\n");
  });

  it("leaves an .env.example that already names the key variable alone", async () => {
    writeFileSync(join(dir, ".env.example"), "export DEEPL_API_KEY = \n");

    const { out } = await initJson({ provider: "deepl", yes: true });

    expect(successResult(out).files[1]).toEqual({ path: ".env.example", action: "unchanged" });
  });

  it.each([
    [".verbatrarc.json", "{}"],
    ["package.json", JSON.stringify({ verbatra: {} })],
  ])("refuses when %s already configures verbatra, even with --force", async (name, content) => {
    writeFileSync(join(dir, name), content);

    const { code, err } = await initJson({ provider: "deepl", yes: true, force: true });

    expect(code).toBe(2);
    expect(err).toContain(`[CONFIG_EXISTS] ${name} already configures verbatra`);
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
  });

  it("ignores a package.json without a verbatra property", async () => {
    writeFileSync(join(dir, "package.json"), "{ broken");

    const { code } = await initJson({ provider: "deepl", yes: true });
    expect(code).toBe(0);
  });

  it("quotes a --cwd with spaces in the next-step commands", async () => {
    const spaced = join(dir, "my project");
    mkdirSync(spaced);
    const cap = captureStreams();
    await runInit(
      { cwd: spaced, json: true, provider: "deepl", yes: true },
      cap.streams,
      nonInteractive,
    );

    const result = successResult(cap.out());
    expect(result.nextSteps.find((step) => step.command !== null)?.command).toBe(
      `npx verbatra doctor --cwd '${spaced}'`,
    );
  });

  it("prints the detection and the next steps in human mode", async () => {
    write("i18n/en.yaml", "a: A\n");
    write("i18n/de.yaml", "a: B\n");
    const cap = captureStreams();
    const code = await runInit({ cwd: dir, provider: "deepl" }, cap.streams, nonInteractive);

    expect(code).toBe(0);
    expect(cap.out()).toContain(
      "detected format yaml, pattern i18n/{locale}.yaml, locales de, en (confidence: medium)",
    );
    expect(cap.out()).toContain("next steps:");
    expect(cap.out()).toContain("  - Copy .env.example to .env and set DEEPL_API_KEY there.");
    expect(cap.out()).toContain("npx verbatra doctor --cwd");
  });

  it("uses an injected detector and prints a detection without locales", async () => {
    const detection: ProjectDetection = {
      format: { id: "arb", from: "dependencies" },
      layout: {
        pattern: "l10n/{locale}.arb",
        localeStyle: "literal",
        locales: [],
        sourceLocale: undefined,
        files: [],
        unqualifiedSourceFile: undefined,
      },
      ambiguities: [],
      confidence: "low",
      reasons: [],
    };
    const cap = captureStreams();
    const code = await runInit({ cwd: dir, provider: "deepl", yes: true }, cap.streams, {
      ...nonInteractive,
      detect: async () => detection,
    });

    expect(code).toBe(0);
    expect(cap.out()).toContain("detected format arb, pattern l10n/{locale}.arb (confidence: low)");
    expect(readConfig()).not.toContain("TODO");
  });

  it("renders a malformed option object as a structured error", async () => {
    const cap = captureStreams();
    const code = await runInit({ cwd: 42, json: true }, cap.streams, terminal);

    expect(code).toBe(2);
    expect(cap.err()).toContain("verbatra: error [");
  });
});
