import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CreateProvider,
  type LocaleSummary,
  loadLockFile,
  type PlaceholderIntegrityResult,
  translate,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { flattenJson } from "@/lib/showcase-flatten";
import { runShowcaseScenario, SEED_LOCK_HASHES } from "@/lib/showcase-scenarios";
import {
  applyShowcaseChange,
  DEFAULT_SHOWCASE_BREAK,
  type JsonTree,
  SHOWCASE_BREAKS,
  SHOWCASE_SCENARIOS,
  SHOWCASE_SOURCE,
  SHOWCASE_TARGET,
  SHOWCASE_TARGET_LOCALE,
  type ShowcaseBreakId,
  type ShowcaseScenarioId,
  showcaseChange,
  showcaseKey,
} from "@/lib/showcase-seed";

const CONFIG: VerbatraConfig = {
  sourceLocale: "en",
  targetLocales: [SHOWCASE_TARGET_LOCALE],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "stub", maxTokens: 256 } },
};

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function stubProvider(replies: ReadonlyMap<string, string>): CreateProvider {
  return () => ({
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request) => ({
      values: new Map(request.entries.map((entry) => [entry.key, replies.get(entry.key) ?? ""])),
      integrity: new Map(request.entries.map((entry) => [entry.key, PASS])),
    }),
  });
}

function values(tree: JsonTree): Map<string, string> {
  return new Map([...flattenJson(tree, "").entries()].map(([key, entry]) => [key, entry.value]));
}

let cwd: string | undefined;

afterEach(async () => {
  if (cwd) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

async function seededProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-docs-showcase-"));
  cwd = dir;
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales/en.json"), JSON.stringify(SHOWCASE_SOURCE));
  await translate(
    { config: CONFIG, cwd: dir },
    { createProvider: stubProvider(values(SHOWCASE_TARGET)) },
  );
  return dir;
}

function localeOf(summary: { locales: ReadonlyArray<LocaleSummary> }): LocaleSummary {
  const locale = summary.locales[0];
  if (!locale) throw new Error("the run reported no locale");
  return locale;
}

describe("the showcase seed is what a real run writes", () => {
  it("writes the seed German file and the seed lock hashes", async () => {
    const dir = await seededProject();
    const written = JSON.parse(await readFile(join(dir, "locales/de.json"), "utf8"));
    expect(written).toEqual(SHOWCASE_TARGET);
    const lock = await loadLockFile({ cwd: dir });
    expect(lock.locales[SHOWCASE_TARGET_LOCALE]).toEqual(SEED_LOCK_HASHES);
  });
});

async function expectRealRun(id: ShowcaseScenarioId, reply?: ShowcaseBreakId): Promise<void> {
  const dir = await seededProject();
  const change = showcaseChange(id, reply);
  await writeFile(
    join(dir, "locales/en.json"),
    JSON.stringify(applyShowcaseChange(SHOWCASE_SOURCE, change)),
  );
  const replies = new Map(
    change.candidate === undefined ? [] : [[showcaseKey(change.path), change.candidate]],
  );
  const summary = await translate(
    { config: CONFIG, cwd: dir },
    { createProvider: stubProvider(replies) },
  );
  const locale = localeOf(summary);
  const outcome = runShowcaseScenario(id, reply);

  expect([...locale.translated].sort()).toEqual(outcome.written);
  expect([...locale.translated, ...locale.integrityMismatches].sort()).toEqual(
    [...outcome.missing, ...outcome.stale].sort(),
  );
  expect([...locale.unchanged].sort()).toEqual(outcome.unchanged);
  expect([...locale.orphaned].sort()).toEqual(outcome.orphaned);
  expect(locale.integrityMismatches).toEqual(outcome.refusal ? [outcome.refusal.key] : []);
  expect(locale.integrityRefusals?.map((refusal) => refusal.details)).toEqual(
    outcome.refusal ? [outcome.refusal.details] : [],
  );
  const lock = await loadLockFile({ cwd: dir });
  expect(lock.locales[SHOWCASE_TARGET_LOCALE]).toEqual(outcome.lockHashes);
}

describe("each showcase scenario matches a real sdk run with a stub provider", () => {
  it.each(SHOWCASE_SCENARIOS)("%s", (id) => expectRealRun(id));

  it.each(SHOWCASE_BREAKS.filter((reply) => reply !== DEFAULT_SHOWCASE_BREAK))(
    "break, where the reply %ss a placeholder",
    (reply) => expectRealRun("break", reply),
  );
});
