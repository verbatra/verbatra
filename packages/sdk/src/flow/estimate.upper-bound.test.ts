import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { dataPayloadCharacters, resultPayloadCharacters } from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import type { RateCard } from "../config/rate-card.js";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  type StubCall,
  writeJsonFile,
} from "../test-support.js";
import {
  ESTIMATED_CHARACTERS_PER_TOKEN,
  ESTIMATED_RESPONSE_SCHEMA_TOKENS,
  ESTIMATED_SYSTEM_RULES_TOKENS,
} from "./estimate.js";
import type { RunEstimate } from "./summary.js";
import { translate } from "./translate-project.js";

const TOKEN_RATES: RateCard = {
  asOf: "2026-01-15",
  currency: "USD",
  table: { "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 } },
};

const CHARACTER_RATES: RateCard = {
  asOf: "2026-01-15",
  currency: "USD",
  table: { deepl: { perMillionCharacters: 25 } },
};

interface ScheduledPlan {
  readonly requests: number;
  readonly keys: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly sourceCharacters: number;
}

function toTokens(characters: number): number {
  return Math.ceil(characters / ESTIMATED_CHARACTERS_PER_TOKEN);
}

function measureScheduled(calls: readonly StubCall[]): ScheduledPlan {
  let keys = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let sourceCharacters = 0;
  for (const { request } of calls) {
    keys += request.entries.length;
    inputTokens +=
      ESTIMATED_SYSTEM_RULES_TOKENS +
      ESTIMATED_RESPONSE_SCHEMA_TOKENS +
      toTokens(
        dataPayloadCharacters({
          sourceLocale: request.sourceLocale,
          targetLocale: request.targetLocale,
          entries: request.entries,
          glossary: request.glossary,
          tone: request.tone,
        }),
      );
    outputTokens += toTokens(
      resultPayloadCharacters(
        request.entries.map((entry) => ({ key: entry.key, value: entry.value })),
      ),
    );
    for (const entry of request.entries) {
      sourceCharacters += entry.value.length;
    }
  }
  return { requests: calls.length, keys, inputTokens, outputTokens, sourceCharacters };
}

async function writeSource(dir: string, source: Record<string, unknown>): Promise<void> {
  await writeJsonFile(join(dir, "locales", "en.json"), source);
}

async function newProject(source: Record<string, unknown>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeSource(dir, source);
  return dir;
}

function anthropic(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return baseConfig({
    provider: { id: "anthropic", options: { model: "sonnet-test", maxTokens: 4096 } },
    ...overrides,
  });
}

async function runLive(
  config: VerbatraConfig,
  dir: string,
  kind: "llm" | "machine-translation" = "llm",
): Promise<readonly StubCall[]> {
  const stub = makeStubProvider({ kind });
  await translate({ config, cwd: dir }, { createProvider: () => stub.provider });
  return stub.calls;
}

async function runEstimate(config: VerbatraConfig, dir: string): Promise<RunEstimate> {
  const summary = await translate({ config, cwd: dir, estimate: true });
  const estimate = summary.estimate;
  if (estimate === undefined) {
    throw new Error("translate({ estimate: true }) returned no estimate");
  }
  return estimate;
}

const MIXED_SOURCE = {
  greeting: "Hello world",
  salute: "Hello world",
  farewell: "Goodbye and thanks for everything",
  item_one: "one item",
  item_other: "{{count}} items",
};

describe("the estimate bounds the plan a live run actually schedules", () => {
  async function mixedProject(): Promise<{ dir: string; config: VerbatraConfig }> {
    const config = anthropic({
      targetLocales: ["pl"],
      generatePlurals: true,
      glossary: { world: "swiat", Goodbye: "Do widzenia" },
      tone: "informal",
      rates: TOKEN_RATES,
    });
    const dir = await newProject(MIXED_SOURCE);
    await runLive(config, dir);
    await rm(join(dir, "locales", "pl.json"));
    await rm(join(dir, "verbatra.lock.json"), { force: true });
    await writeSource(dir, { ...MIXED_SOURCE, fresh: "A brand new string nobody has seen" });
    return { dir, config };
  }

  it("counts at least the requests, keys and prompt a run of plain translation, duplicate sources, cache hits and plural generation sends", async () => {
    const { dir, config } = await mixedProject();

    const estimate = await runEstimate(config, dir);
    const scheduled = measureScheduled(await runLive(config, dir));

    expect(scheduled.requests).toBeGreaterThan(0);
    expect(estimate.requests).toBeGreaterThanOrEqual(scheduled.requests);
    expect(estimate.keys).toBeGreaterThanOrEqual(scheduled.keys);
    expect(estimate.inputTokens ?? 0).toBeGreaterThanOrEqual(scheduled.inputTokens);
  });

  it("bounds the response payload it models, which is sized from the source rather than the translation", async () => {
    const { dir, config } = await mixedProject();

    const estimate = await runEstimate(config, dir);
    const scheduled = measureScheduled(await runLive(config, dir));

    expect(scheduled.outputTokens).toBeGreaterThan(0);
    expect(estimate.outputTokens ?? 0).toBeGreaterThanOrEqual(scheduled.outputTokens);
  });

  it("exercises every one of those paths in the same run rather than only the easy one", async () => {
    const { dir, config } = await mixedProject();

    const estimate = await runEstimate(config, dir);
    const calls = await runLive(config, dir);
    const sentKeys = calls.flatMap(({ request }) => request.entries.map((entry) => entry.key));

    expect(sentKeys).toContain("fresh");
    expect(sentKeys).toContain("item_few");
    expect(sentKeys).not.toContain("greeting");
    expect(sentKeys).not.toContain("salute");
    expect(estimate.keys).toBeGreaterThan(sentKeys.length);
  });

  it("holds on a character-billed provider, where source characters are the billed dimension", async () => {
    const config = anthropic({
      targetLocales: ["pl"],
      provider: { id: "deepl", options: {} },
      rates: CHARACTER_RATES,
    });
    const dir = await newProject(MIXED_SOURCE);

    const estimate = await runEstimate(config, dir);
    const scheduled = measureScheduled(await runLive(config, dir, "machine-translation"));

    expect(scheduled.sourceCharacters).toBeGreaterThan(0);
    expect(estimate.unit).toBe("characters");
    expect(estimate.sourceCharacters ?? 0).toBeGreaterThanOrEqual(scheduled.sourceCharacters);
    expect(estimate.requests).toBeGreaterThanOrEqual(scheduled.requests);
  });

  it("prices the bound too, so the money never sits below what the scheduled plan comes to", async () => {
    const { dir, config } = await mixedProject();

    const estimate = await runEstimate(config, dir);
    const scheduled = measureScheduled(await runLive(config, dir));
    const rate = TOKEN_RATES.table["anthropic/sonnet-test"];
    const scheduledCost =
      (scheduled.inputTokens * 3) / 1_000_000 + (scheduled.outputTokens * 15) / 1_000_000;

    expect(rate).toEqual({ inputPerMillionTokens: 3, outputPerMillionTokens: 15 });
    expect(estimate.pricing).toBe("priced");
    expect(estimate.cost ?? 0).toBeGreaterThanOrEqual(scheduledCost);
  });
});

describe("plural generation on its own is a spend path and is counted as one", () => {
  const PLURAL_SOURCE = { item_one: "one item", item_other: "{{count}} items" };

  async function settledPolishProject(): Promise<{ dir: string; config: VerbatraConfig }> {
    const config = anthropic({
      targetLocales: ["pl"],
      generatePlurals: false,
      rates: TOKEN_RATES,
    });
    const dir = await newProject(PLURAL_SOURCE);
    await runLive(config, dir);
    return { dir, config: { ...config, generatePlurals: true } };
  }

  it("still schedules provider calls when nothing at all is left to translate", async () => {
    const { dir, config } = await settledPolishProject();

    const settled = await translate({ config, cwd: dir, estimate: true });
    const calls = await runLive(config, dir);

    expect(settled.locales[0]?.translated).toEqual([]);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("reports that work rather than reporting an empty run", async () => {
    const { dir, config } = await settledPolishProject();

    const estimate = await runEstimate(config, dir);

    expect(estimate.keys).toBeGreaterThan(0);
    expect(estimate.requests).toBeGreaterThan(0);
    expect(estimate.inputTokens ?? 0).toBeGreaterThan(0);
    expect(estimate.cost ?? 0).toBeGreaterThan(0);
  });

  it("counts every form the live run generates and no fewer", async () => {
    const { dir, config } = await settledPolishProject();

    const estimate = await runEstimate(config, dir);
    const scheduled = measureScheduled(await runLive(config, dir));

    expect(estimate.keys).toBeGreaterThanOrEqual(scheduled.keys);
    expect(estimate.requests).toBeGreaterThanOrEqual(scheduled.requests);
    expect(estimate.inputTokens ?? 0).toBeGreaterThanOrEqual(scheduled.inputTokens);
  });
});

describe("the glossary and the tone ride in every request and are counted in every one", () => {
  const MANY_TERMS = Object.fromEntries(
    Array.from({ length: 200 }, (_, index) => [`sourceTerm${index}`, `zielbegriff${index}`]),
  );
  const GLOSSARY_CHARACTERS = JSON.stringify(MANY_TERMS).length;

  function batchedConfig(glossary?: Record<string, string>): VerbatraConfig {
    return anthropic({
      targetLocales: ["de"],
      maxBatchSize: 2,
      rates: TOKEN_RATES,
      ...(glossary !== undefined ? { glossary } : {}),
    });
  }

  const SIX_KEYS = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [`k${index}`, `distinct source string ${index}`]),
  );

  it("scales the prompt with the number of requests, not once per run", async () => {
    const plainDir = await newProject(SIX_KEYS);
    const glossaryDir = await newProject(SIX_KEYS);

    const plain = await runEstimate(batchedConfig(), plainDir);
    const withGlossary = await runEstimate(batchedConfig(MANY_TERMS), glossaryDir);

    expect(plain.requests).toBe(3);
    expect(withGlossary.requests).toBe(3);
    expect((withGlossary.inputTokens ?? 0) - (plain.inputTokens ?? 0)).toBeGreaterThanOrEqual(
      3 * Math.floor(GLOSSARY_CHARACTERS / ESTIMATED_CHARACTERS_PER_TOKEN),
    );
  });

  it("grows the counted prompt when the number of requests grows and the glossary does not", async () => {
    const wideDir = await newProject(SIX_KEYS);
    const narrowDir = await newProject(SIX_KEYS);

    const oneRequest = await runEstimate(
      anthropic({ targetLocales: ["de"], maxBatchSize: 50, glossary: MANY_TERMS }),
      wideDir,
    );
    const threeRequests = await runEstimate(batchedConfig(MANY_TERMS), narrowDir);

    expect(oneRequest.requests).toBe(1);
    expect(threeRequests.requests).toBe(3);
    expect(threeRequests.inputTokens ?? 0).toBeGreaterThan((oneRequest.inputTokens ?? 0) * 2);
  });

  it("counts at least the glossary bytes the live run really puts on the wire", async () => {
    const dir = await newProject(SIX_KEYS);
    const config = batchedConfig(MANY_TERMS);

    const estimate = await runEstimate(config, dir);
    const calls = await runLive(config, dir);
    const scheduled = measureScheduled(calls);

    expect(calls.every(({ request }) => request.glossary === MANY_TERMS)).toBe(true);
    expect(estimate.inputTokens ?? 0).toBeGreaterThanOrEqual(scheduled.inputTokens);
    expect(scheduled.inputTokens).toBeGreaterThan(
      3 * Math.floor(GLOSSARY_CHARACTERS / ESTIMATED_CHARACTERS_PER_TOKEN),
    );
  });

  it("counts the tone the live run sends alongside the glossary", async () => {
    const plainDir = await newProject(SIX_KEYS);
    const tonedDir = await newProject(SIX_KEYS);
    const toned = anthropic({ targetLocales: ["de"], maxBatchSize: 2, tone: "formal" });

    const plain = await runEstimate(
      anthropic({ targetLocales: ["de"], maxBatchSize: 2 }),
      plainDir,
    );
    const estimate = await runEstimate(toned, tonedDir);
    const calls = await runLive(toned, tonedDir);

    expect(calls.every(({ request }) => request.tone === "formal")).toBe(true);
    expect(estimate.inputTokens ?? 0).toBeGreaterThan(plain.inputTokens ?? 0);
  });
});

describe("the response is sized for a translation that expands, not for the source string", () => {
  const GERMAN_EXPANSION = 1.4;

  const TWENTY_KEYS = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [
      `checkout.step${index}`,
      `Please confirm your delivery address before you continue ${index}`,
    ]),
  );

  function expandLike(target: string): (value: string) => string {
    return (value) =>
      `[${target}] ${value}`.padEnd(Math.ceil(value.length * GERMAN_EXPANSION), "z");
  }

  function returnedOutputTokens(calls: readonly StubCall[]): number {
    let characters = 0;
    for (const { request } of calls) {
      characters += resultPayloadCharacters(
        request.entries.map((entry) => ({
          key: entry.key,
          value: expandLike(request.targetLocale)(entry.value),
        })),
      );
    }
    return toTokens(characters);
  }

  it("counts at least the output tokens a provider returning a longer translation really produces", async () => {
    const config = anthropic({ targetLocales: ["de"], rates: TOKEN_RATES });
    const dir = await newProject(TWENTY_KEYS);

    const estimate = await runEstimate(config, dir);
    const stub = makeStubProvider({ translate: expandLike("de") });
    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });
    const returned = returnedOutputTokens(stub.calls);

    expect(returned).toBeGreaterThan(0);
    expect(estimate.outputTokens ?? 0).toBeGreaterThanOrEqual(returned);
  });

  it("prices that larger response, since completion tokens are the expensive dimension", async () => {
    const config = anthropic({ targetLocales: ["de"], rates: TOKEN_RATES });
    const dir = await newProject(TWENTY_KEYS);

    const estimate = await runEstimate(config, dir);
    const stub = makeStubProvider({ translate: expandLike("de") });
    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });
    const scheduled = measureScheduled(stub.calls);
    const returnedCost =
      (scheduled.inputTokens * 3) / 1_000_000 + (returnedOutputTokens(stub.calls) * 15) / 1_000_000;

    expect(estimate.cost ?? 0).toBeGreaterThanOrEqual(returnedCost);
  });
});
