import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Usage } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { projectBatchTokens } from "./budget.js";
import type { LocaleSummary, RunSummary } from "./summary.js";
import { translate } from "./translate-project.js";

const USAGE_100: Usage = { inputTokens: 60, outputTokens: 40 };

const PLURAL_SOURCE = {
  items_one: "{{count}} item",
  items_other: "{{count}} items",
  k0: "first value",
  k1: "second value",
  k2: "third value",
  k3: "fourth value",
};

const LOCALES = ["pl", "ru", "cs"];

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "", value, placeholders: [], isPlural: false };
}

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), PLURAL_SOURCE);
  for (const locale of LOCALES) {
    await writeJsonFile(join(dir, "locales", `${locale}.json`), {});
  }
  return dir;
}

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({
    targetLocales: LOCALES,
    maxBatchSize: 1,
    maxTokens: 500,
    budgetBehavior: "stop",
    ...overrides,
  });

async function run(generatePlurals: boolean): Promise<RunSummary> {
  const dir = await project();
  const stub = makeStubProvider({ usage: USAGE_100 });
  return translate(
    { config: cfg(), cwd: dir, generatePlurals },
    { createProvider: () => stub.provider },
  );
}

function budgetMessages(locale: LocaleSummary | undefined): readonly string[] {
  return (locale?.notices ?? [])
    .filter((notice) => notice.code === "BUDGET_TOKENS_EXCEEDED")
    .map((notice) => notice.message);
}

function projectionFrom(message: string): string {
  const match = /projected at (\d+) tokens/.exec(message);
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

interface Split {
  readonly refusing: LocaleSummary;
  readonly later: readonly LocaleSummary[];
}

function splitAtRefusal(summary: RunSummary): Split {
  const index = summary.locales.findIndex((locale) =>
    budgetMessages(locale).some((message) => message.includes("projected at")),
  );
  expect(index).toBeGreaterThanOrEqual(0);
  const refusing = summary.locales[index];
  expect(refusing).toBeDefined();
  const later = summary.locales.slice(index + 1);
  expect(later.length).toBeGreaterThan(0);
  return { refusing: refusing as LocaleSummary, later };
}

function expectAlreadyStopped(split: Split): void {
  const projection = projectionFrom(budgetMessages(split.refusing)[0] ?? "");
  for (const locale of split.later) {
    const messages = budgetMessages(locale);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("had already reached its configured budget");
    expect(messages[0]).toContain("so this locale's keys were withheld rather than sent");
    expect(messages[0]).not.toContain("projected at");
    expect(messages[0]).not.toContain(`${projection} tokens on top of`);
    expect(locale.status).toBe("failed");
    expect(locale.translated).toEqual([]);
  }
}

describe("budget refusal carrying: a later locale that starts already stopped", () => {
  it("gets the already-stopped message, never the earlier locale's projection (plurals off)", async () => {
    const summary = await run(false);

    const split = splitAtRefusal(summary);
    expectAlreadyStopped(split);
    expect(split.refusing.budgetWithheld.length).toBeGreaterThan(0);
  });

  it("gets the already-stopped message, never the earlier locale's projection (plurals on)", async () => {
    const summary = await run(true);

    const split = splitAtRefusal(summary);
    expectAlreadyStopped(split);
  });

  it("withholds the generated plural keys of a later locale too, not only its translations", async () => {
    const summary = await run(true);

    const split = splitAtRefusal(summary);
    for (const locale of split.later) {
      expect(locale.generated).toEqual([]);
      expect(locale.budgetWithheld.length).toBeGreaterThan(0);
    }
  });

  it.each([
    [false, "plurals off"],
    [true, "plurals on"],
  ])(
    "quotes the exact projection of the request it refused and the total before it (%s, %s)",
    async (generatePlurals) => {
      const summary = await run(generatePlurals);

      const split = splitAtRefusal(summary);
      const refusedRequest = [entry("k0", PLURAL_SOURCE.k0)];
      const projection = projectBatchTokens(refusedRequest, {
        sourceLocale: "en",
        targetLocale: split.refusing.locale,
      });
      const countedBeforeRefusal = 2 * (USAGE_100.inputTokens + USAGE_100.outputTokens);

      expect(split.refusing.locale).toBe("pl");
      expect(split.refusing.translated).toEqual(["items_one", "items_other"]);
      expect(summary.budget?.tokensUsed).toBe(countedBeforeRefusal);
      expect(budgetMessages(split.refusing)).toEqual([
        `The run's next provider request was projected at ${projection} tokens on top of the ` +
          `${countedBeforeRefusal} already counted, which would have crossed the configured budget ` +
          "of 500 tokens, so it was withheld rather than sent (behavior: stop).",
      ]);
    },
  );

  it("reports the run's own counted total in the already-stopped message", async () => {
    const summary = await run(false);

    const split = splitAtRefusal(summary);
    const counted = summary.budget?.tokensUsed ?? -1;
    expect(counted).toBeGreaterThan(0);
    for (const locale of split.later) {
      expect(budgetMessages(locale)[0]).toContain(`(${counted} counted, behavior: stop)`);
    }
  });
});
