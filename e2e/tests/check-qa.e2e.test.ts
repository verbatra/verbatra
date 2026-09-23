import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface QaFindingJson {
  key: string;
  severity: "error" | "warning";
  reason: string;
  details?: string[];
}

interface CheckQaJson {
  inSync: boolean;
  locales: { locale: string; qa: { checked: number; errors: number; findings: QaFindingJson[] } }[];
  qa: { errors: number; warnings: number; invalidSourceKeys: string[] };
}

let consumer: Consumer;

const SOURCE = { greeting: "Hello {{name}}", title: "Settings" };

async function projectWith(name: string, german: Record<string, string>): Promise<string> {
  const dir = join(consumer.dir, `check-qa-${name}`);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },
  });
  await writeJsonIn(dir, "locales/en.json", SOURCE);
  await writeJsonIn(dir, "locales/de.json", german);
  return dir;
}

const NO_PROVIDER_KEYS = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEEPL_API_KEY: "",
  GOOGLE_TRANSLATE_API_KEY: "",
};

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("check --qa on committed translations, with no provider key", () => {
  it("exits 1 with a structured finding for a hand-broken placeholder, writing nothing", async () => {
    const dir = await projectWith("broken", { greeting: "Hallo {{nme}}", title: "Einstellungen" });

    const run = await runVerbatra(consumer, ["check", "--qa", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(run.exitCode).toBe(1);
    const envelope = parseEnvelope<CheckQaJson>(run.stdout);
    if (!envelope.ok) {
      throw new Error(`Expected a check success envelope, got [${envelope.code}]`);
    }
    expect(envelope.result.inSync).toBe(true);
    expect(envelope.result.qa).toEqual({ errors: 1, warnings: 0, invalidSourceKeys: [] });
    expect(envelope.result.locales[0]?.qa.findings).toEqual([
      {
        key: "greeting",
        severity: "error",
        reason: "placeholder",
        details: ["-{{name}}", "+{{nme}}"],
      },
    ]);
    expect((await readdir(dir)).sort()).toEqual([".verbatrarc.json", "locales"]);
  });

  it("exits 0 on warnings alone and 1 once --strict is given", async () => {
    const dir = await projectWith("warned", { greeting: "Hallo {{name}}", title: "Settings" });

    const lenient = await runVerbatra(consumer, ["check", "--qa", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });
    const strict = await runVerbatra(consumer, ["check", "--qa", "--strict", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(lenient.exitCode).toBe(0);
    expect(lenient.stdout).toContain("title: warning EQUALS_SOURCE");
    expect(strict.exitCode).toBe(1);
  });
});
