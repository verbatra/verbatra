import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  JSON_ENVELOPE_VERSION,
  PROVIDER_ENV_VARS,
  parseEnvelope,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface PseudoResultJson {
  locale: string;
  path: string;
  entries: number;
  transformed: number;
  copied: string[];
  written: boolean;
}

const NO_PROVIDER_KEYS: Record<string, string> = Object.fromEntries(
  Object.values(PROVIDER_ENV_VARS).map((name) => [name, ""]),
);

const config = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
};

let consumer: Consumer;

async function seedProject(name: string): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", config);
  await writeJsonIn(dir, "locales/en.json", {
    greeting: "Hello {{name}}",
    farewell: "Goodbye for now",
  });
  await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo {{name}}" });
  return dir;
}

function successResult(stdout: string): PseudoResultJson {
  const envelope = parseEnvelope<PseudoResultJson>(stdout);
  if (!envelope.ok) {
    throw new Error(
      `Expected a pseudo success envelope, got [${envelope.code}] ${envelope.message}`,
    );
  }
  expect(envelope.version).toBe(JSON_ENVELOPE_VERSION);
  expect(envelope.command).toBe("pseudo");
  return envelope.result;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("pseudo (no provider, no key)", () => {
  it("generates a pseudolocale with every provider key variable blank", async () => {
    const dir = await seedProject("pseudo-basic");

    const result = await runVerbatra(consumer, ["pseudo", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(result.exitCode).toBe(0);
    const summary = successResult(result.stdout);
    expect(summary).toMatchObject({ locale: "en-XA", entries: 2, transformed: 2, written: true });
    expect(summary.path).toBe(join(dir, ".verbatra-local", "pseudo", "locales", "en-XA.json"));
  });

  it("keeps the placeholder intact and accents the surrounding text", async () => {
    const dir = await seedProject("pseudo-placeholders");

    await runVerbatra(consumer, ["pseudo", "--cwd", dir], { env: NO_PROVIDER_KEYS });
    const written = await readJsonIn<Record<string, string>>(
      dir,
      ".verbatra-local/pseudo/locales/en-XA.json",
    );

    expect(written.greeting).toContain("{{name}}");
    expect(written.greeting).toContain("Ĥéĺĺó");
    expect(written.greeting).not.toBe("Hello {{name}}");
  });

  it("leaves the real locale files alone and stays invisible to check", async () => {
    const dir = await seedProject("pseudo-nondestructive");
    const sourceBefore = await readFile(join(dir, "locales", "en.json"), "utf8");
    const targetBefore = await readFile(join(dir, "locales", "de.json"), "utf8");
    const checkBefore = await runVerbatra(consumer, ["check", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    await runVerbatra(consumer, ["pseudo", "--cwd", dir], { env: NO_PROVIDER_KEYS });
    const checkAfter = await runVerbatra(consumer, ["check", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(await readFile(join(dir, "locales", "en.json"), "utf8")).toBe(sourceBefore);
    expect(await readFile(join(dir, "locales", "de.json"), "utf8")).toBe(targetBefore);
    expect(checkAfter.exitCode).toBe(checkBefore.exitCode);
    expect(checkAfter.stdout).toBe(checkBefore.stdout);
    expect(checkAfter.stdout).not.toContain("en-XA");
  });

  it("reports the second run as unchanged", async () => {
    const dir = await seedProject("pseudo-idempotent");

    await runVerbatra(consumer, ["pseudo", "--cwd", dir], { env: NO_PROVIDER_KEYS });
    const second = await runVerbatra(consumer, ["pseudo", "--json", "--cwd", dir], {
      env: NO_PROVIDER_KEYS,
    });

    expect(successResult(second.stdout).written).toBe(false);
  });

  it("refuses to write a pseudolocale over a configured locale file", async () => {
    const dir = await seedProject("pseudo-refuses");

    const result = await runVerbatra(
      consumer,
      ["pseudo", "--json", "--locale", "de", "--cwd", dir],
      {
        env: NO_PROVIDER_KEYS,
      },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("PSEUDO_OUTPUT_CONFLICT");
  });
});
