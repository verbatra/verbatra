import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { GATE_LOCK_HASHES, GATE_LOCK_LINES, GATE_SOURCE_VALUES } from "@/lib/gate-demo";

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

const echoProvider: CreateProvider = () => ({
  id: "stub",
  kind: "llm",
  supportsGlossary: true,
  translateBatch: async (request) => ({
    values: new Map(request.entries.map((entry) => [entry.key, entry.value])),
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

describe("the gate demo lock panel", () => {
  it("shows the hashes a real run writes for the demo's source strings", async () => {
    cwd = await mkdtemp(join(tmpdir(), "verbatra-docs-gate-"));
    await mkdir(join(cwd, "messages"));
    await writeFile(join(cwd, "messages/en.json"), JSON.stringify(nest(GATE_SOURCE_VALUES)));

    await translate({ config: CONFIG, cwd }, { createProvider: echoProvider });
    const lock = await loadLockFile({ cwd });

    expect(lock.locales.de).toEqual(GATE_LOCK_HASHES);
  });

  it("prints the pinned hashes in the panel", () => {
    for (const [key, hash] of Object.entries(GATE_LOCK_HASHES)) {
      expect(GATE_LOCK_LINES.some((line) => line.includes(`"${key}": "${hash}"`))).toBe(true);
    }
  });
});
