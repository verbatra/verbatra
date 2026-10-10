import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CreateProvider,
  check,
  loadConfigWithMeta,
  type PlaceholderIntegrityResult,
  translate,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  CHECK_CLI_COMMAND,
  CHECK_EXIT_CODE,
  CHECK_LOCALE,
  CHECK_MISSING_KEYS,
  CHECK_RUN_LINES,
} from "@/lib/check-demo";
import { GATE_REPLIES, GATE_SOURCE_VALUES } from "@/lib/gate-demo";
import { renderCheckHuman } from "../../../packages/cli/src/render";
import { run } from "../../../packages/cli/src/run";

const CONFIG: VerbatraConfig = {
  sourceLocale: "en",
  targetLocales: [CHECK_LOCALE],
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

const unused = async (): Promise<never> => {
  throw new Error("the check demo calls only check");
};

let cwd: string | undefined;

afterEach(async () => {
  if (cwd) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

async function gateProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-docs-check-"));
  await mkdir(join(dir, "messages"));
  await writeFile(join(dir, "messages/en.json"), JSON.stringify(nest(GATE_SOURCE_VALUES)));
  await writeFile(join(dir, ".verbatrarc.json"), JSON.stringify(CONFIG));
  await translate({ config: CONFIG, cwd: dir }, { createProvider: replyingProvider });
  return dir;
}

describe("the How check is what a real check does after the gate run", () => {
  it("prints exactly the lines renderCheckHuman renders for the withheld key", async () => {
    cwd = await gateProject();
    const summary = await check({ config: CONFIG, cwd });

    expect(summary.inSync).toBe(false);
    expect(summary.locales.map((locale) => locale.locale)).toEqual([CHECK_LOCALE]);
    expect(summary.locales[0]?.missing).toBe(CHECK_MISSING_KEYS.length);
    expect(renderCheckHuman(summary).split("\n")).toEqual(CHECK_RUN_LINES);
  });

  it("exits with the code the verbatra binary returns, printing the same lines", async () => {
    cwd = await gateProject();
    const out: string[] = [];
    const code = await run(
      ["check", "--cwd", cwd],
      {
        translate: unused,
        watch: unused,
        exportWorkbook: unused,
        importWorkbook: unused,
        check,
        checkFile: unused,
        diff: unused,
        doctor: unused,
        loadConfigWithMeta,
        pseudolocalize: unused,
        importStudio: unused,
        importMcp: unused,
        extract: unused,
        generateTypes: unused,
        importTmx: unused,
        exportTmx: unused,
        provenanceReport: unused,
      },
      { out: (text) => out.push(text), err: () => undefined },
    );

    expect(code).toBe(CHECK_EXIT_CODE);
    expect(out.join("").trimEnd().split("\n")).toEqual(CHECK_RUN_LINES);
    expect(CHECK_RUN_LINES[0]).toBe(CHECK_CLI_COMMAND);
  });
});
