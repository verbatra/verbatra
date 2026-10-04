import { mkdir } from "node:fs/promises";
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

interface IncompletePluralJson {
  code: string;
  key: string;
  argument?: string;
  ruleType: string;
  missing: string[];
}

interface CheckJson {
  inSync: boolean;
  locales: { locale: string; incompletePlurals: IncompletePluralJson[] }[];
}

interface DoctorJson {
  checks: { id: string; status: string; detail: string }[];
}

let consumer: Consumer;

const PLURALS =
  '<?xml version="1.0" encoding="utf-8"?>\n<resources><plurals name="files">' +
  '<item quantity="one">%d file</item><item quantity="other">%d files</item>' +
  "</plurals></resources>\n";

async function androidProject(): Promise<string> {
  const dir = join(consumer.dir, "plural-completeness-android");
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["pl"],
    format: "android-xml",
    files: { pattern: "res/{locale}/strings.xml", localeStyle: "android" },
    provider: { id: "none", options: {} },
  });
  await writeFileIn(dir, "res/values/strings.xml", PLURALS);
  await writeFileIn(dir, "res/values-pl/strings.xml", PLURALS);
  return dir;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("plural completeness of a Polish Android file with only one and other", () => {
  it("check reports the missing categories as a warning and still exits 0", async () => {
    const dir = await androidProject();

    const run = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);

    expect(run.exitCode).toBe(0);
    const envelope = parseEnvelope<CheckJson>(run.stdout);
    if (!envelope.ok) {
      throw new Error(`Expected a check success envelope, got [${envelope.code}]`);
    }
    expect(envelope.result.inSync).toBe(true);
    expect(envelope.result.locales[0]?.incompletePlurals).toEqual([
      {
        code: "PLURAL_CATEGORIES_INCOMPLETE",
        key: "files",
        ruleType: "cardinal",
        missing: ["few", "many"],
      },
    ]);
  });

  it("check --qa --strict fails on the incomplete plural", async () => {
    const dir = await androidProject();

    const run = await runVerbatra(consumer, ["check", "--qa", "--strict", "--cwd", dir]);

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain("files: missing few, many");
  });

  it("doctor names the plural in its informational check", async () => {
    const dir = await androidProject();

    const run = await runVerbatra(consumer, ["doctor", "--json", "--cwd", dir]);

    const envelope = parseEnvelope<DoctorJson>(run.stdout);
    if (!envelope.ok) {
      throw new Error(`Expected a doctor success envelope, got [${envelope.code}]`);
    }
    const check = envelope.result.checks.find((entry) => entry.id === "plural-completeness");
    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("pl: files (few, many)");
  });
});
