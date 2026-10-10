import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLI_ERROR_HINTS } from "./cli-error-hints.js";
import { type InitDeps, runInit } from "./init.js";
import { askLine } from "./prompt.js";
import { DEFAULT_TERMINAL_SETTINGS } from "./terminal-mode.js";
import { captureStreams, parseEnvelope } from "./test-support.js";

const nonInteractive: InitDeps = { isTty: () => false };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queuedAsk(answers: readonly string[]): InitDeps & { readonly asked: () => number } {
  let index = 0;
  return {
    isTty: () => true,
    ask: async () => answers[index++] ?? "",
    asked: () => index,
  };
}

const canDropWriteAccess = process.getuid?.() !== 0 && process.platform !== "win32";

describe("runInit: the --cwd directory", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-"));
  });

  afterEach(() => {
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ["a missing directory", (root: string) => join(root, "missing")],
    [
      "a file",
      (root: string) => {
        writeFileSync(join(root, "file"), "");
        return join(root, "file");
      },
    ],
  ])("refuses %s with INVALID_OPTION rather than a file-system code", async (_label, target) => {
    const cwd = target(dir);
    const cap = captureStreams();

    const code = await runInit({ cwd, json: true, provider: "none" }, cap.streams);

    expect(code).toBe(2);
    const envelope = parseEnvelope(cap.out());
    expect(envelope).toMatchObject({ ok: false, code: "INVALID_OPTION" });
    expect(envelope.message).toContain(`--cwd names "${cwd}", which is not an existing directory`);
    expect(existsSync(join(dir, "missing"))).toBe(false);
  });

  it.runIf(canDropWriteAccess)(
    "reports a read-only directory as INIT_UNWRITABLE and names the file",
    async () => {
      chmodSync(dir, 0o555);
      const cap = captureStreams();

      const code = await runInit(
        { cwd: dir, json: true, yes: true, provider: "none" },
        cap.streams,
      );

      expect(code).toBe(2);
      const envelope = parseEnvelope(cap.out());
      expect(envelope).toMatchObject({ ok: false, code: "INIT_UNWRITABLE" });
      expect(envelope.message).toContain(`init could not write verbatra.config.ts in ${dir}`);
      expect(envelope.message).toContain("Nothing was written.");
    },
  );

  it("refuses an unreadable file it has to change before writing anything", async () => {
    mkdirSync(join(dir, ".gitignore"));
    const cap = captureStreams();

    const code = await runInit({ cwd: dir, json: true, yes: true, provider: "none" }, cap.streams);

    expect(code).toBe(2);
    const envelope = parseEnvelope(cap.out());
    expect(envelope).toMatchObject({ ok: false, code: "INIT_UNWRITABLE" });
    expect(envelope.message).toContain("init could not write .gitignore");
    expect(envelope.message).toContain("Nothing was written.");
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
  });

  it.runIf(canDropWriteAccess)(
    "names the files already written when a later one cannot be written",
    async () => {
      writeFileSync(join(dir, ".env.example"), "OTHER=\n");
      chmodSync(join(dir, ".env.example"), 0o444);
      const cap = captureStreams();

      const code = await runInit(
        { cwd: dir, json: true, yes: true, provider: "gemini" },
        cap.streams,
      );

      expect(code).toBe(2);
      const envelope = parseEnvelope(cap.out());
      expect(envelope).toMatchObject({ ok: false, code: "INIT_UNWRITABLE" });
      expect(envelope.message).toContain("init could not write .env.example");
      expect(envelope.message).toContain("verbatra.config.ts was already written.");
    },
  );

  it("passes a failure without a file-system code through unchanged", async () => {
    const cap = captureStreams();
    const code = await runInit({ cwd: dir, json: true, yes: true, provider: "none" }, cap.streams, {
      isTty: () => false,
      detect: async () => {
        throw new Error("detection broke");
      },
    });

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out()).message).toBe("detection broke");
  });
});

describe("runInit: interactive answers are checked as they are given", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("asks again after an invalid answer and keeps every valid one", async () => {
    const cap = captureStreams();
    const deps = queuedAsk([
      "nope",
      "anthropic",
      "yaml-ish",
      "",
      "german",
      "fr",
      "fr, es",
      "es, it",
      "i18n/messages.json",
      "i18n/{locale}.json",
    ]);

    const code = await runInit({ cwd: dir }, cap.streams, deps);

    expect(code).toBe(0);
    expect(deps.asked()).toBe(10);
    expect(cap.err()).toContain('Unknown provider "nope"');
    expect(cap.err()).toContain('Unknown format "yaml-ish"');
    expect(cap.err()).toContain('"german" is not a BCP 47 locale code');
    expect(cap.err()).toContain("must not include the source locale fr");
    expect(cap.err()).toContain('"i18n/messages.json" has no {locale} token');
    expect(cap.err()).toContain("Answer again.");
  });

  it("asks again for an openai-compatible base URL that is not a URL or carries credentials", async () => {
    const cap = captureStreams();
    const deps = queuedAsk([
      "openai-compatible",
      "localhost 1234",
      "http://user:pass@localhost:1234/v1",
      "http://localhost:1234/v1",
      "qwen",
    ]);

    const code = await runInit({ cwd: dir, yes: false }, cap.streams, deps);

    expect(code).toBe(0);
    expect(cap.err()).toContain('"localhost 1234" is not a URL');
    expect(cap.err()).toContain("must not carry credentials");
  });

  it("exits 2 with a usage error when stdin ends during a prompt", async () => {
    const cap = captureStreams();
    const input = new PassThrough();
    const deps: InitDeps = {
      isTty: () => true,
      ask: (question) => {
        const answer = askLine(question, cap.streams, input);
        input.end();
        return answer;
      },
    };

    const code = await runInit({ cwd: dir }, cap.streams, deps);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[MISSING_OPTIONS] Input ended before init got an answer to");
    expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
  });

  it("gives up after three invalid answers and reports the last one", async () => {
    const cap = captureStreams();
    const deps = queuedAsk(["nope", "still-nope", "never"]);

    const code = await runInit({ cwd: dir }, cap.streams, deps);

    expect(code).toBe(2);
    expect(deps.asked()).toBe(3);
    expect(cap.err()).toContain('[INVALID_PROVIDER] Unknown provider "never"');
    expect(cap.err()).toContain('Stopped asking for "Provider');
  });

  it.each([
    [
      "the format",
      ["anthropic", "x", "y", "z"],
      "INVALID_FORMAT",
      "Locale file format (",
      "--format <id>",
    ],
    [
      "the source locale",
      ["anthropic", "", "a b", "c d", "e f"],
      "INVALID_LOCALE",
      'Source locale"',
      "--source <locale>",
    ],
    [
      "the target locales",
      ["anthropic", "", "en", "en", "en", "de,en"],
      "INVALID_LOCALES",
      'Target locales (comma-separated)"',
      "--targets <locales>",
    ],
    [
      "the file pattern",
      ["anthropic", "", "en", "de", "a.json", "b.json", "c.json"],
      "INVALID_OPTION",
      'Locale file pattern"',
      "--path <pattern>",
    ],
    [
      "the base URL",
      ["openai-compatible", "not a url", "also not", "http://u:p@localhost/v1"],
      "INVALID_OPTION",
      'Base URL of the OpenAI-compatible server"',
      "--base-url <url>",
    ],
  ])(
    "stops on the third invalid answer for %s with its code and names the field",
    async (_label, answers, errorCode, fieldLabel, flag) => {
      const cap = captureStreams();
      const deps = queuedAsk(answers);

      const code = await runInit({ cwd: dir }, cap.streams, deps);

      expect(code).toBe(2);
      expect(deps.asked()).toBe(answers.length);
      expect(cap.err()).toContain(`[${errorCode}]`);
      expect(cap.err()).toContain(`Stopped asking for "${fieldLabel}`);
      expect(cap.err()).toContain(`after 3 invalid answers; pass ${flag} instead.`);
      expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
    },
  );

  it("asks none of the remaining questions once an answer is refused", async () => {
    const cap = captureStreams();
    const deps = queuedAsk(["nope", "still-nope", "never", "anthropic", "", "en", "de", ""]);

    await runInit({ cwd: dir }, cap.streams, deps);

    expect(deps.asked()).toBe(3);
  });
});

describe("runInit: an existing config is reported first", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-init-"));
    writeFileSync(join(dir, "verbatra.config.ts"), "export default {};\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports CONFIG_EXISTS instead of the flags a new config would still need", async () => {
    const cap = captureStreams();

    const code = await runInit({ cwd: dir, json: true }, cap.streams, nonInteractive);

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({ ok: false, code: "CONFIG_EXISTS" });
  });

  it("reports CONFIG_EXISTS instead of an ambiguous format", async () => {
    mkdirSync(join(dir, "locales"));
    writeFileSync(join(dir, "locales", "en.json"), "{}");
    writeFileSync(join(dir, "locales", "en.yaml"), "a: b\n");
    const cap = captureStreams();

    const code = await runInit({ cwd: dir, json: true, provider: "none" }, cap.streams);

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({ ok: false, code: "CONFIG_EXISTS" });
  });

  it("refuses before the first prompt at a terminal", async () => {
    const cap = captureStreams();
    const deps = queuedAsk(["anthropic"]);

    const code = await runInit({ cwd: dir }, cap.streams, deps);

    expect(code).toBe(2);
    expect(deps.asked()).toBe(0);
    expect(cap.err()).toContain("[CONFIG_EXISTS] verbatra.config.ts already exists");
  });

  it("prints the next step after the CONFIG_EXISTS error line", async () => {
    const cap = captureStreams();

    const code = await runInit({ cwd: dir, yes: true, provider: "none" }, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toMatch(
      new RegExp(
        `^verbatra: error \\[CONFIG_EXISTS\\] .*\\nnext: ${escapeRegExp(CLI_ERROR_HINTS.CONFIG_EXISTS)}\\n$`,
      ),
    );
  });

  it("keeps the next step off stderr under --json and --quiet, and in the envelope", async () => {
    const json = captureStreams();
    await runInit({ cwd: dir, json: true, provider: "none" }, json.streams);
    expect(json.err()).not.toContain("next:");
    expect(parseEnvelope(json.out())).toMatchObject({ hint: CLI_ERROR_HINTS.CONFIG_EXISTS });

    const quiet = captureStreams();
    await runInit(
      { cwd: dir, yes: true, provider: "none" },
      quiet.streams,
      {},
      {
        ...DEFAULT_TERMINAL_SETTINGS,
        quiet: true,
      },
    );
    expect(quiet.err()).toContain("[CONFIG_EXISTS]");
    expect(quiet.err()).not.toContain("next:");
  });

  it("points a competing config file at removal, since --force does not replace it", () => {
    expect(CLI_ERROR_HINTS.CONFIG_EXISTS).toContain("--force to replace verbatra.config.ts");
    expect(CLI_ERROR_HINTS.CONFIG_EXISTS).toContain("remove any other config file");
  });

  it("still plans and overwrites under --force", async () => {
    const cap = captureStreams();

    const code = await runInit(
      { cwd: dir, yes: true, force: true, provider: "none" },
      cap.streams,
      nonInteractive,
    );

    expect(code).toBe(0);
    expect(cap.out()).toContain("overwrote verbatra.config.ts");
  });
});
