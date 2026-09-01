import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

let consumer: Consumer;

const config = {
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },
};

async function seedMultiLocale(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", { ...config, ...extra });
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello {{name}}", farewell: "Goodbye" });
  await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo {{name}}" });
  await writeJsonIn(dir, "locales/fr.json", { greeting: "Bonjour {{name}}" });
  return dir;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("translate --dry-run --concurrency 2 (no provider)", () => {
  it("exits 0, writes nothing, prints progress to stderr while stdout stays the dry-run summary", async () => {
    const dir = await seedMultiLocale("dry-run-concurrency");
    const result = await runVerbatra(
      consumer,
      ["translate", "--dry-run", "--concurrency", "2", "--cwd", dir],
      { env: { ANTHROPIC_API_KEY: "" } },
    );

    expect(result.exitCode).toBe(0);

    expect(result.stderr).toMatch(/translating/);
    expect(result.stderr).toMatch(/run finished/);

    expect(result.stdout).not.toMatch(/^verbatra: /m);
    expect(result.stdout).toContain("(dry run: nothing written)");

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    const fr = await readJsonIn<Record<string, string>>(dir, "locales/fr.json");
    expect(de.farewell).toBeUndefined();
    expect(fr.farewell).toBeUndefined();
  });
});

describe("translate --no-cache --dry-run (no provider)", () => {
  it("accepts --no-cache end to end and exits 0", async () => {
    const dir = await seedMultiLocale("no-cache-dry-run");
    const result = await runVerbatra(
      consumer,
      ["translate", "--no-cache", "--dry-run", "--cwd", dir],
      { env: { ANTHROPIC_API_KEY: "" } },
    );
    expect(result.exitCode).toBe(0);
  });
});

describe("translate --concurrency 2 with a token budget (no provider key)", () => {
  it("exits 2 on the budget guard before any provider construction, never on a missing key", async () => {
    const dir = await seedMultiLocale("concurrency-budget-conflict", { maxTokens: 4096 });
    const result = await runVerbatra(consumer, ["translate", "--concurrency", "2", "--cwd", dir], {
      env: { ANTHROPIC_API_KEY: "" },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CONCURRENCY_BUDGET_CONFLICT");
    expect(result.stderr).not.toMatch(/API_KEY/);
  });
});

describe("translate --locales (no provider)", () => {
  it("narrows the run to the named locale and leaves the other out of the summary entirely", async () => {
    const dir = await seedMultiLocale("locale-subset");
    const result = await runVerbatra(
      consumer,
      ["translate", "--dry-run", "--locales", "fr", "--cwd", dir, "--json"],
      { env: { ANTHROPIC_API_KEY: "" } },
    );

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout) as {
      result: { locales: { locale: string }[] };
    };
    expect(envelope.result.locales.map((entry) => entry.locale)).toEqual(["fr"]);
  });

  it("rejects a locale that is not a configured target, before reading or spending anything", async () => {
    const dir = await seedMultiLocale("locale-subset-unknown");
    const result = await runVerbatra(
      consumer,
      ["translate", "--dry-run", "--locales", "zz", "--cwd", dir],
      { env: { ANTHROPIC_API_KEY: "" } },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[UNKNOWN_LOCALE]");
  });

  it("rejects an empty --locales list as a usage error", async () => {
    const dir = await seedMultiLocale("locale-subset-empty");
    const result = await runVerbatra(
      consumer,
      ["translate", "--dry-run", "--locales", "", "--cwd", dir],
      { env: { ANTHROPIC_API_KEY: "" } },
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INVALID_LOCALES]");
  });
});
