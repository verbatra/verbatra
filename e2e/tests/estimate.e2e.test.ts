import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

let consumer: Consumer;

const NO_KEYS = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEEPL_API_KEY: "",
  GOOGLE_TRANSLATE_API_KEY: "",
};

const baseConfig = {
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "sonnet-test", maxTokens: 4096 } },
};

async function seed(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", { ...baseConfig, ...extra });
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello {{name}}", farewell: "Goodbye" });
  return dir;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function tree(dir: string): Promise<Record<string, string>> {
  const names = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const item of names) {
    if (!item.isFile()) {
      continue;
    }
    const path = join(item.parentPath, item.name);
    files[path.slice(dir.length + 1)] = await readFile(path, "utf8");
  }
  return files;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("translate --estimate (no provider, no key)", () => {
  it("exits 0 and reports the size of the run without any API key present", async () => {
    const dir = await seed("estimate-unpriced");

    const result = await runVerbatra(consumer, ["translate", "--estimate", "--cwd", dir], {
      env: NO_KEYS,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("(dry run: nothing written)");
    expect(result.stdout).toMatch(/estimate: 4 keys in 2 requests/);
    expect(result.stdout).toContain("no rate on file for anthropic/sonnet-test");
  });

  it("writes no locale file, no lock file, and no cache file", async () => {
    const dir = await seed("estimate-writes-nothing");

    await runVerbatra(consumer, ["translate", "--estimate", "--cwd", dir], { env: NO_KEYS });

    expect(await exists(join(dir, "locales", "de.json"))).toBe(false);
    expect(await exists(join(dir, "locales", "fr.json"))).toBe(false);
    expect(await exists(join(dir, "verbatra.lock.json"))).toBe(false);
    expect(await exists(join(dir, "verbatra.cache.json"))).toBe(false);
  });

  it("leaves the project tree byte-identical, including .gitignore", async () => {
    const dir = await seed("estimate-tree-unchanged");
    await writeFile(join(dir, ".gitignore"), ".env\n");
    const before = await tree(dir);

    const result = await runVerbatra(consumer, ["translate", "--estimate", "--cwd", dir], {
      env: NO_KEYS,
    });

    expect(result.exitCode).toBe(0);
    expect(await tree(dir)).toEqual(before);
  });

  it("prints a currency figure with its date once the config supplies rates", async () => {
    const dir = await seed("estimate-priced", {
      rates: {
        asOf: "2026-01-15",
        currency: "USD",
        table: {
          "anthropic/sonnet-test": {
            inputPerMillionTokens: 3,
            outputPerMillionTokens: 15,
          },
        },
      },
    });

    const result = await runVerbatra(consumer, ["translate", "--estimate", "--cwd", dir], {
      env: NO_KEYS,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("USD");
    expect(result.stdout).toContain("rates as of 2026-01-15");
  });

  it("carries the estimate as structured fields on the JSON envelope", async () => {
    const dir = await seed("estimate-json");

    const result = await runVerbatra(
      consumer,
      ["translate", "--estimate", "--json", "--cwd", dir],
      { env: NO_KEYS },
    );

    expect(result.exitCode).toBe(0);
    const envelope = parseEnvelope<{
      estimate: {
        keys: number;
        requests: number;
        unit: string;
        pricing: string;
        locales: readonly { locale: string }[];
      };
    }>(result.stdout.trim());
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) {
      return;
    }
    expect(envelope.result.estimate.keys).toBe(4);
    expect(envelope.result.estimate.requests).toBe(2);
    expect(envelope.result.estimate.unit).toBe("tokens");
    expect(envelope.result.estimate.pricing).toBe("no-rate-on-file");
    expect(envelope.result.estimate.locales.map((entry) => entry.locale)).toEqual(["de", "fr"]);
  });
});

describe("translate --estimate: what the packaged build actually counts", () => {
  async function inputTokensOf(name: string, extra: Record<string, unknown>): Promise<number> {
    const dir = await seed(name, extra);
    const result = await runVerbatra(
      consumer,
      ["translate", "--estimate", "--json", "--cwd", dir],
      { env: NO_KEYS },
    );

    expect(result.exitCode).toBe(0);
    const envelope = parseEnvelope<{ estimate: { inputTokens: number } }>(result.stdout.trim());
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) {
      throw new Error("the estimate envelope was not ok");
    }
    return envelope.result.estimate.inputTokens;
  }

  it("counts a configured glossary, which the bundled payload builder puts in every request", async () => {
    const glossary = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`sourceTerm${index}`, `targetTerm${index}`]),
    );

    const plain = await inputTokensOf("estimate-no-glossary", {});
    const withGlossary = await inputTokensOf("estimate-glossary", { glossary });

    expect(withGlossary).toBeGreaterThan(plain * 3);
  });

  it("counts the plural forms generation would send on a project whose keys are in sync", async () => {
    const dir = join(consumer.dir, "estimate-plurals");
    await mkdir(join(dir, "locales"), { recursive: true });
    await writeJsonIn(dir, ".verbatrarc.json", {
      ...baseConfig,
      targetLocales: ["ru"],
      generatePlurals: true,
    });
    await writeJsonIn(dir, "locales/en.json", {
      item_one: "one item",
      item_other: "{{count}} items",
    });
    await writeJsonIn(dir, "locales/ru.json", {
      item_one: "odin predmet",
      item_other: "{{count}} predmetov",
    });

    const result = await runVerbatra(
      consumer,
      ["translate", "--estimate", "--json", "--cwd", dir],
      { env: NO_KEYS },
    );

    expect(result.exitCode).toBe(0);
    const envelope = parseEnvelope<{
      locales: readonly { translated: readonly string[] }[];
      estimate: { keys: number; requests: number };
    }>(result.stdout.trim());
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) {
      return;
    }
    expect(envelope.result.locales[0]?.translated).toEqual([]);
    expect(envelope.result.estimate.keys).toBe(2);
    expect(envelope.result.estimate.requests).toBe(1);
  });
});
