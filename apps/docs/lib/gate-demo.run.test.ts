import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { check, translate } from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { englishDocsPages } from "@/lib/docs-pages";
import {
  GATE_CHECK_COMMAND,
  GATE_CHECK_EXIT_CODE,
  GATE_CHECK_HEADER,
  GATE_CHECK_LINES,
  GATE_DE_CANDIDATE,
  GATE_DE_OLD,
  GATE_DOCS_PATH,
  GATE_KEY,
  GATE_LOCALE,
  GATE_MODEL,
  GATE_PLACEHOLDER,
  GATE_REFUSED_BADGE,
  GATE_REFUSED_LINES,
  GATE_SOURCE,
  GATE_SOURCE_BEFORE,
  GATE_SOURCE_FILE,
  GATE_SOURCE_LOCALE,
  GATE_TARGET_ELISION,
  GATE_TARGET_EXCERPT,
  GATE_TARGET_FILE,
  GATE_TARGET_GROUP,
  GATE_TARGET_LEAF,
  GATE_TRANSLATE_COMMAND,
  GATE_TRANSLATE_HEADER,
} from "@/lib/gate-demo";
import {
  fixtureConfig,
  readTarget,
  removeProject,
  runCli,
  sourceFile,
  stubProvider,
  tempProject,
  writeConfig,
  writeSource,
} from "@/test-support/run-fixture";
import { SCAFFOLD_MODELS } from "../../../packages/ai-providers/src/scaffold";
import { renderCheckHuman, renderHuman } from "../../../packages/cli/src/render";

const CONFIG = fixtureConfig(GATE_MODEL);

const TRANSLATE_ARGV = ["translate"] as const;

const CHECK_ARGV = ["check"] as const;

type Phase = "seed" | "edited";

let phase: Phase = "seed";

const provider = () =>
  stubProvider((key, value) => {
    if (key !== GATE_KEY) return `${value} (t)`;
    return phase === "seed" ? GATE_DE_OLD : GATE_DE_CANDIDATE;
  });

const sourceBefore = () =>
  sourceFile(({ key, value }) => (key === GATE_KEY ? GATE_SOURCE_BEFORE : value));

const sourceAfter = () => sourceFile(({ value }) => value);

let cwd: string | undefined;

afterEach(async () => {
  await removeProject(cwd);
  cwd = undefined;
});

async function refusedProject(): Promise<string> {
  const dir = await tempProject("verbatra-docs-gate-");
  cwd = dir;
  phase = "seed";
  await writeConfig(dir, CONFIG);
  await writeSource(dir, sourceBefore());
  await translate({ config: CONFIG, cwd: dir }, { createProvider: provider() });
  await writeSource(dir, sourceAfter());
  phase = "edited";
  return dir;
}

type Tree = Record<string, Record<string, string>>;

async function written(dir: string, locale: string): Promise<Tree> {
  return JSON.parse(await readTarget(dir, locale)) as Tree;
}

function leafOf(tree: Tree): string | undefined {
  const [group, leaf] = GATE_KEY.split(".") as [string, string];
  return tree[group]?.[leaf];
}

describe("the gate demo prints what verbatra prints after a refusal", () => {
  it("edits one source value that carries a placeholder, in the file the config names", async () => {
    const dir = await refusedProject();
    expect(GATE_SOURCE).toContain(GATE_PLACEHOLDER);
    expect(GATE_SOURCE_BEFORE).toContain(GATE_PLACEHOLDER);
    expect(GATE_SOURCE_BEFORE).not.toBe(GATE_SOURCE);
    expect(leafOf(JSON.parse(sourceBefore()))).toBe(GATE_SOURCE_BEFORE);
    expect(leafOf(JSON.parse(await readFile(join(dir, "locales/en.json"), "utf8")))).toBe(
      GATE_SOURCE,
    );
    expect(await readdir(join(dir, "locales"))).toEqual(
      expect.arrayContaining([GATE_SOURCE_FILE, GATE_TARGET_FILE]),
    );
    expect(GATE_SOURCE_LOCALE).toBe(CONFIG.sourceLocale);
    expect(CONFIG.targetLocales).toContain(GATE_LOCALE);
  });

  it("badges the candidate with the model verbatra init scaffolds for the provider the config names", () => {
    const provider = CONFIG.provider.id as keyof typeof SCAFFOLD_MODELS;
    expect(SCAFFOLD_MODELS[provider]).toBe(GATE_MODEL);
  });

  it("holds the old German value the seeded run wrote, and a candidate that dropped the placeholder", async () => {
    const dir = await refusedProject();
    expect(leafOf(await written(dir, GATE_LOCALE))).toBe(GATE_DE_OLD);
    expect(GATE_DE_OLD).toContain(GATE_PLACEHOLDER);
    expect(GATE_DE_CANDIDATE).not.toContain(GATE_PLACEHOLDER);
  });

  it("excerpts the target file the seeded run wrote: the first lines of the group verbatim, then an elision", async () => {
    const dir = await refusedProject();
    const file = await readTarget(dir, GATE_LOCALE);
    const [open, leaf, elision] = GATE_TARGET_EXCERPT;
    const dedented = file
      .split("\n")
      .map((line) => line.replace(/^ {2}/, ""))
      .join("\n");
    expect(dedented).toContain(`${open}\n${leaf}\n`);
    expect(elision?.trim()).toBe(GATE_TARGET_ELISION);
    const group = (JSON.parse(file) as Tree)[GATE_TARGET_GROUP] ?? {};
    expect(Object.keys(group).length).toBeGreaterThan(1);
    expect(Object.keys(group)[0]).toBe(GATE_TARGET_LEAF);
  });

  it("refuses the candidate and prints the lines renderHuman renders", async () => {
    const dir = await refusedProject();
    const summary = await translate({ config: CONFIG, cwd: dir }, { createProvider: provider() });
    const [locale] = summary.locales;

    expect(locale?.translated).toEqual([]);
    expect(locale?.integrityRefusals).toEqual([
      { key: GATE_KEY, reason: "placeholder", details: [`-${GATE_PLACEHOLDER}`] },
    ]);
    const lines = renderHuman(summary).split("\n");
    const refusals = locale?.integrityRefusals ?? [];
    expect(lines).toEqual([GATE_TRANSLATE_HEADER, ...GATE_REFUSED_LINES]);
    expect(lines[1]?.endsWith(`, ${refusals.length} integrity-withheld`)).toBe(true);
    expect(GATE_REFUSED_BADGE).toBe(`${refusals.length} integrity-withheld`);
  });

  it("exits translate with the code the binary returns, printing the same lines, after the command it names", async () => {
    const dir = await refusedProject();
    const { code, out } = await runCli([...TRANSLATE_ARGV, "--cwd", dir], provider());

    expect(code).toBe(1);
    expect(out).toEqual([GATE_TRANSLATE_HEADER, ...GATE_REFUSED_LINES]);
    const cli = JSON.parse(
      await readFile(join(import.meta.dirname, "../../../packages/cli/package.json"), "utf8"),
    ) as { name: string };
    expect(GATE_TRANSLATE_COMMAND).toBe(`npx ${cli.name} ${TRANSLATE_ARGV.join(" ")}`);
    expect(GATE_CHECK_COMMAND).toBe(`npx ${cli.name} ${CHECK_ARGV.join(" ")}`);
  });

  it("does not touch the target file or the lock: both are byte-identical after the refused run", async () => {
    const dir = await refusedProject();
    const target = await readTarget(dir, GATE_LOCALE);
    const lock = await readFile(join(dir, "verbatra.lock.json"), "utf8");
    await runCli([...TRANSLATE_ARGV, "--cwd", dir], provider());
    expect(await readTarget(dir, GATE_LOCALE)).toBe(target);
    expect(await readFile(join(dir, "verbatra.lock.json"), "utf8")).toBe(lock);
    expect(leafOf(await written(dir, GATE_LOCALE))).toBe(GATE_DE_OLD);
  });

  it("keeps the key stale: check prints the lines and the exit code the binary returns", async () => {
    const dir = await refusedProject();
    await runCli([...TRANSLATE_ARGV, "--cwd", dir], provider());
    const summary = await check({ config: CONFIG, cwd: dir });
    const { code, out } = await runCli([...CHECK_ARGV, "--cwd", dir], provider());

    expect(summary.inSync).toBe(false);
    expect(renderCheckHuman(summary).split("\n")).toEqual([GATE_CHECK_HEADER, ...GATE_CHECK_LINES]);
    expect(code).toBe(GATE_CHECK_EXIT_CODE);
    expect(out).toEqual([GATE_CHECK_HEADER, ...GATE_CHECK_LINES]);
  });

  it("links a docs page that exists", () => {
    const slug = GATE_DOCS_PATH.replace("/docs/", "");
    const pages = englishDocsPages(join(import.meta.dirname, "..", "content/docs"));
    expect(
      pages.map(({ file }) =>
        file
          .replace(/\.mdx$/, "")
          .split("/")
          .pop(),
      ),
    ).toContain(slug);
  });
});
