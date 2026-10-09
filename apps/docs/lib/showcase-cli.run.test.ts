import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CreateProvider,
  type PlaceholderIntegrityResult,
  type RunSummary,
  translate,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { showcaseRunLines, showcaseSavings } from "@/lib/showcase-cli";
import { flattenJson } from "@/lib/showcase-flatten";
import { runShowcaseScenario, type ShowcaseOutcome, showcaseSeed } from "@/lib/showcase-scenarios";
import {
  applyShowcaseChange,
  type JsonTree,
  SHOWCASE_BREAKS,
  SHOWCASE_CHANGES,
  SHOWCASE_SCENARIOS,
  SHOWCASE_SOURCE,
  SHOWCASE_TARGET,
  SHOWCASE_TARGET_LOCALE,
  showcaseChange,
  showcaseKey,
} from "@/lib/showcase-seed";
import { renderHuman } from "../../../packages/cli/src/render";

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
  const dir = await mkdtemp(join(tmpdir(), "verbatra-docs-showcase-cli-"));
  cwd = dir;
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales/en.json"), JSON.stringify(SHOWCASE_SOURCE));
  await translate(
    { config: CONFIG, cwd: dir },
    { createProvider: stubProvider(values(SHOWCASE_TARGET)) },
  );
  return dir;
}

function printed(summary: RunSummary): ReadonlyArray<string> {
  return renderHuman(summary).split("\n");
}

describe("the showcase output pane prints what verbatra translate prints", () => {
  it("prints the seed run, which translates nothing", async () => {
    const dir = await seededProject();
    const summary = await translate(
      { config: CONFIG, cwd: dir },
      { createProvider: stubProvider(new Map()) },
    );
    expect(showcaseRunLines(showcaseSeed())).toEqual(printed(summary));
  });

  it.each(SHOWCASE_SCENARIOS)("prints the %s scenario run", async (id) => {
    const dir = await seededProject();
    const change = SHOWCASE_CHANGES[id];
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
    const outcome = runShowcaseScenario(id);
    expect(showcaseRunLines(outcome)).toEqual(printed(summary));
    const locale = summary.locales[0];
    expect(showcaseSavings(outcome).sent).toBe(
      (locale?.translated.length ?? 0) + (locale?.integrityMismatches.length ?? 0),
    );
  });

  it.each(SHOWCASE_BREAKS)(
    "prints the break run where the reply %ss a placeholder",
    async (reply) => {
      const dir = await seededProject();
      const change = showcaseChange("break", reply);
      await writeFile(
        join(dir, "locales/en.json"),
        JSON.stringify(applyShowcaseChange(SHOWCASE_SOURCE, change)),
      );
      const summary = await translate(
        { config: CONFIG, cwd: dir },
        {
          createProvider: stubProvider(
            new Map([[showcaseKey(change.path), change.candidate ?? ""]]),
          ),
        },
      );
      const outcome = runShowcaseScenario("break", reply);
      expect(outcome.refusal).not.toBeNull();
      expect(showcaseRunLines(outcome)).toEqual(printed(summary));
    },
  );

  it("prints a partial run when one edit is written and another reply is withheld", async () => {
    const dir = await seededProject();
    const edit = SHOWCASE_CHANGES.edit;
    const broken = SHOWCASE_CHANGES.break;
    await writeFile(
      join(dir, "locales/en.json"),
      JSON.stringify(applyShowcaseChange(applyShowcaseChange(SHOWCASE_SOURCE, edit), broken)),
    );
    const replies = new Map([
      [showcaseKey(edit.path), edit.candidate ?? ""],
      [showcaseKey(broken.path), broken.candidate ?? ""],
    ]);
    const summary = await translate(
      { config: CONFIG, cwd: dir },
      { createProvider: stubProvider(replies) },
    );
    const breakRun = runShowcaseScenario("break");
    const mixed: ShowcaseOutcome = {
      ...breakRun,
      stale: [showcaseKey(edit.path), showcaseKey(broken.path)].sort(),
      unchanged: breakRun.unchanged.filter((key) => key !== showcaseKey(edit.path)),
      written: [showcaseKey(edit.path)],
    };
    expect(showcaseRunLines(mixed)).toEqual(printed(summary));
    expect(printed(summary)).toContain("0 succeeded, 1 partial, 0 failed");
  });
});
