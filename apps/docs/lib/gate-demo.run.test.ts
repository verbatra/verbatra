import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CreateProvider,
  loadLockFile,
  type PlaceholderIntegrityResult,
  translate,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  GATE_CLI_COMMAND,
  GATE_LOCK_HASHES,
  GATE_MISSING_PLACEHOLDER,
  GATE_REFUSAL,
  GATE_REPLIES,
  GATE_RUN_LINES,
  GATE_SOURCE_VALUES,
  GATE_WITHHELD_LABEL,
} from "@/lib/gate-demo";

const CONFIG: VerbatraConfig = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "next-intl-json",
  files: { pattern: "messages/{locale}.json" },
  provider: { id: "anthropic", options: { model: "stub", maxTokens: 256 } },
};

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

const replyingProvider: CreateProvider = () => ({
  id: "stub",
  kind: "llm",
  supportsGlossary: true,
  translateBatch: async (request) => ({
    values: new Map(
      request.entries.map((entry) => [
        entry.key,
        GATE_REPLIES[entry.key as keyof typeof GATE_REPLIES] ?? "",
      ]),
    ),
    integrity: new Map(request.entries.map((entry) => [entry.key, PASS])),
  }),
});

function nest(values: Readonly<Record<string, string>>): Record<string, unknown> {
  const tree: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(values)) {
    const [group, leaf] = key.split(".") as [string, string];
    tree[group] = { ...tree[group], [leaf]: value };
  }
  return tree;
}

let cwd: string | undefined;

afterEach(async () => {
  if (cwd) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

describe("the How terminal is what a real run does with the demo project", () => {
  it("translates one key, withholds the reply that drops the placeholder, and locks only the written key", async () => {
    cwd = await mkdtemp(join(tmpdir(), "verbatra-docs-gate-"));
    await mkdir(join(cwd, "messages"));
    await writeFile(join(cwd, "messages/en.json"), JSON.stringify(nest(GATE_SOURCE_VALUES)));

    const summary = await translate({ config: CONFIG, cwd }, { createProvider: replyingProvider });
    const locale = summary.locales[0];

    expect(locale?.status).toBe("partial");
    expect(locale?.translated).toEqual(["inbox.title"]);
    expect(locale?.unchanged).toEqual([]);
    expect(locale?.integrityMismatches).toEqual([GATE_REFUSAL.key]);
    expect(locale?.integrityRefusals).toEqual([
      {
        key: GATE_REFUSAL.key,
        reason: GATE_REFUSAL.reason,
        details: [`-${GATE_MISSING_PLACEHOLDER}`],
      },
    ]);
    if (!locale) throw new Error("the run reported no locale");
    const silent = [
      locale.cacheHits,
      locale.fuzzyHits,
      locale.generated,
      locale.orphaned,
      locale.pruned,
      locale.invalidIcuSource,
      locale.providerFailures,
      locale.budgetWithheld,
      locale.sensitiveWithheld,
      locale.unfilled,
      locale.protected,
      locale.malformedRows,
      locale.duplicateKeys,
      locale.needsReview,
      locale.notices,
    ];
    expect(silent.every((group) => group.length === 0)).toBe(true);
    expect([summary.usage, locale.usage, summary.budget, summary.estimate]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(summary.dryRun).toBe(false);
    const refusals = (locale.integrityRefusals ?? []).map(
      (refusal) => `      ${refusal.key}: ${refusal.reason} (${refusal.details?.join(", ")})`,
    );
    expect(GATE_RUN_LINES).toEqual([
      GATE_CLI_COMMAND,
      `  ${locale.locale}: ${locale.translated.length} translated, ${locale.unchanged.length} unchanged, ${locale.integrityMismatches.length} ${GATE_WITHHELD_LABEL}`,
      `    ${GATE_WITHHELD_LABEL}:`,
      ...refusals,
      `${summary.succeeded.length} succeeded, ${summary.partial.length} partial, ${summary.failed.length} failed`,
    ]);
    const written = JSON.parse(await readFile(join(cwd, "messages/de.json"), "utf8"));
    expect(written).toEqual({ inbox: { title: GATE_REPLIES["inbox.title"] } });
    const lock = await loadLockFile({ cwd });
    expect(lock.locales.de).toEqual(GATE_LOCK_HASHES);
  });
});
