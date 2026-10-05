import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface CheckSensitiveJson {
  sensitive: {
    findings: { key: string; fields: string[]; detectors: string[] }[];
    glossaryTerms: number;
  };
}

let consumer: Consumer;

const SECRET = "ops@acme.io";

async function projectWith(
  name: string,
  source: Record<string, string>,
  german: Record<string, string> = {},
): Promise<string> {
  const dir = join(consumer.dir, `check-sensitive-${name}`);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },
    sensitiveData: { mode: "block", patterns: ["Falcon"] },
  });
  await writeJsonIn(dir, "locales/en.json", source);
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

describe("check --sensitive, with no provider key", () => {
  it("exits 1 and names keys and detectors, never the matched text", async () => {
    const dir = await projectWith("found", {
      contact: `Write to ${SECRET}`,
      codename: "Project Falcon",
      greeting: "Hello",
    });

    const run = await runVerbatra(consumer, ["check", "--sensitive", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(run.exitCode).toBe(1);
    expect(run.stdout).not.toContain(SECRET);
    const envelope = parseEnvelope<CheckSensitiveJson>(run.stdout);
    if (!envelope.ok) {
      throw new Error(`Expected a check success envelope, got [${envelope.code}]`);
    }
    expect(envelope.result.sensitive).toEqual({
      findings: [
        { key: "contact", fields: ["value"], detectors: ["email"] },
        { key: "codename", fields: ["value"], detectors: ["pattern"] },
      ],
      glossaryTerms: 0,
    });
  });

  it("exits 0 on a clean source that is in sync", async () => {
    const dir = await projectWith("clean", { greeting: "Hello" }, { greeting: "Hallo" });

    const run = await runVerbatra(consumer, ["check", "--sensitive", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(run.stdout).toContain("sensitive: nothing found");
    expect(run.exitCode).toBe(0);
  });
});
