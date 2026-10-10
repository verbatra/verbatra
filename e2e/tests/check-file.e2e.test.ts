import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface FileFindingJson {
  key?: string;
  severity: "error" | "warning";
  reason: string;
  details?: string[];
  code?: string;
  message?: string;
  line?: number;
  column?: number;
}

interface CheckFileJson {
  file: string;
  role: "source" | "target" | "catalogue";
  locales: {
    locale: string;
    incompletePlurals: unknown[];
    qa: { checked: number; errors: number; warnings: number; findings: FileFindingJson[] };
  }[];
  qa: { errors: number; warnings: number; invalidSourceKeys: string[] };
}

let consumer: Consumer;

const SOURCE = { greeting: "Hello {{name}}", title: "Settings" };

const NO_PROVIDER_KEYS = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEEPL_API_KEY: "",
  GOOGLE_TRANSLATE_API_KEY: "",
};

async function projectWith(name: string, german: string): Promise<string> {
  const dir = join(consumer.dir, `check-file-${name}`);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },
  });
  await writeJsonIn(dir, "locales/en.json", SOURCE);
  await writeFileIn(dir, "locales/de.json", german);
  await writeFileIn(dir, "locales/fr.json", "{ this French file is broken too");
  return dir;
}

async function checkFileRun(dir: string, file: string) {
  const run = await runVerbatra(consumer, ["check", "--file", file, "--json", "--cwd", dir], {
    env: NO_PROVIDER_KEYS,
  });
  return { run, envelope: parseEnvelope<CheckFileJson>(run.stdout) };
}

function successResult(envelope: ReturnType<typeof parseEnvelope<CheckFileJson>>): CheckFileJson {
  if (!envelope.ok) {
    throw new Error(`Expected a check success envelope, got [${envelope.code}]`);
  }
  return envelope.result;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("check --file validates one locale file, with no provider key", () => {
  it("exits 0 for a good file and never reads the other, broken locale", async () => {
    const dir = await projectWith(
      "good",
      JSON.stringify({ greeting: "Hallo {{name}}", title: "Einstellungen" }),
    );

    const { run, envelope } = await checkFileRun(dir, "locales/de.json");

    expect(run.exitCode).toBe(0);
    const result = successResult(envelope);
    expect(result).toMatchObject({ file: join("locales", "de.json"), role: "target" });
    expect(result.qa).toEqual({ errors: 0, warnings: 0, invalidSourceKeys: [] });
    expect(result.locales.map((locale) => locale.locale)).toEqual(["de"]);
  });

  it("exits 1 with the placeholder finding for a hand-broken placeholder, writing nothing", async () => {
    const dir = await projectWith(
      "placeholder",
      JSON.stringify({ greeting: "Hallo {{nme}}", title: "Einstellungen" }),
    );
    const before = await readFile(join(dir, "locales/de.json"));

    const { run, envelope } = await checkFileRun(dir, join(dir, "locales/de.json"));

    expect(run.exitCode).toBe(1);
    expect(successResult(envelope).locales[0]?.qa.findings).toEqual([
      {
        key: "greeting",
        severity: "error",
        reason: "placeholder",
        details: ["-{{name}}", "+{{nme}}"],
      },
    ]);
    expect((await readdir(dir)).sort()).toEqual([".verbatrarc.json", "locales"]);
    expect((await readFile(join(dir, "locales/de.json"))).equals(before)).toBe(true);
  });

  it("exits 1 with a located syntax finding for broken JSON instead of aborting", async () => {
    const dir = await projectWith(
      "syntax",
      '{\n  "greeting": "Hallo {{name}}"\n  "title": "Titel"\n}\n',
    );

    const { run, envelope } = await checkFileRun(dir, "locales/de.json");

    expect(run.exitCode).toBe(1);
    expect(successResult(envelope).locales[0]?.qa.findings).toEqual([
      {
        severity: "error",
        reason: "syntax",
        code: "INVALID_JSON",
        message: "The file is not valid JSON (line 3, column 3).",
        line: 3,
        column: 3,
      },
    ]);
  });

  it("exits 2 with NOT_A_LOCALE_FILE for a path that is not a locale file", async () => {
    const dir = await projectWith("not-locale", JSON.stringify(SOURCE));
    await writeJsonIn(dir, "src/data.json", {});

    const { run, envelope } = await checkFileRun(dir, "src/data.json");

    expect(run.exitCode).toBe(2);
    expect(envelope).toMatchObject({ ok: false, command: "check", code: "NOT_A_LOCALE_FILE" });
  });

  it("checks the source locale file for syntax alone", async () => {
    const dir = await projectWith("source", JSON.stringify({ greeting: "Hallo" }));

    const { run, envelope } = await checkFileRun(dir, "locales/en.json");

    expect(run.exitCode).toBe(0);
    expect(successResult(envelope)).toMatchObject({ role: "source", qa: { errors: 0 } });
  });

  it("is refused as a usage error when combined with --locales", async () => {
    const dir = await projectWith("usage", JSON.stringify(SOURCE));

    const run = await runVerbatra(
      consumer,
      ["check", "--file", "locales/de.json", "--locales", "de", "--json", "--cwd", dir],
      { env: NO_PROVIDER_KEYS },
    );

    expect(run.exitCode).toBe(2);
    expect(parseEnvelope(run.stdout)).toMatchObject({ ok: false, code: "INVALID_OPTION" });
  });
});
