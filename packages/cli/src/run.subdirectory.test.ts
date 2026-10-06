import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  check,
  checkFile,
  doctor,
  exportTmx,
  exportWorkbook,
  generateTypes,
  importTmx,
  importWorkbook,
  loadConfigWithMeta,
  pseudolocalize,
  translate,
} from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, parseEnvelope, recordingDeps } from "./test-support.js";
import type { CliDeps } from "./types.js";

const realDeps: Partial<CliDeps> = {
  loadConfigWithMeta,
  check,
  checkFile,
  doctor,
  exportTmx,
  exportWorkbook,
  generateTypes,
  importTmx,
  importWorkbook,
  pseudolocalize,
  translate,
};

function writeProject(root: string): void {
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, "locales"), { recursive: true });
  writeFileSync(
    join(root, ".verbatrarc.json"),
    JSON.stringify({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "none" },
    }),
  );
  writeFileSync(join(root, ".gitignore"), "node_modules\n");
  writeFileSync(join(root, "locales", "en.json"), JSON.stringify({ hello: "Hello", bye: "Bye" }));
  writeFileSync(join(root, "locales", "de.json"), JSON.stringify({ hello: "Hallo" }));
}

async function verbatra(...argv: string[]) {
  const cap = captureStreams();
  const code = await run(argv, recordingDeps(realDeps).deps, cap.streams);
  return { code, out: cap.out(), err: cap.err() };
}

describe("a command run from a subdirectory of the project", () => {
  let original: string;
  let root: string;
  let nested: string;

  beforeEach(() => {
    original = process.cwd();
    root = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-subdir-")));
    writeProject(root);
    nested = join(root, "src", "components");
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);
  });

  afterEach(() => {
    process.chdir(original);
    rmSync(root, { recursive: true, force: true });
  });

  it("check reads the locale files next to the config the search found", async () => {
    const result = await verbatra("check", "--json");

    expect(result.code).toBe(1);
    expect(parseEnvelope(result.out).result).toMatchObject({
      locales: [{ locale: "de", missing: 1, upToDate: 1 }],
    });
  });

  it("--cwd naming a subdirectory starts the search there and roots the run at the config", async () => {
    process.chdir(root);

    const result = await verbatra("check", "--cwd", "src", "--json");

    expect(result.code).toBe(1);
    expect(parseEnvelope(result.out).ok).toBe(true);
  });

  it("translate writes the state files at the project root, not in the subdirectory", async () => {
    const result = await verbatra("translate", "--json");

    expect(result.code).toBe(3);
    expect(existsSync(join(root, "verbatra.lock.json"))).toBe(true);
    expect(existsSync(join(nested, "verbatra.lock.json"))).toBe(false);
    expect(existsSync(join(nested, "locales"))).toBe(false);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain(".verbatra-local");
  });

  it("doctor finds the source locale file", async () => {
    const result = await verbatra("doctor", "--json");

    expect(result.code).toBe(0);
  });

  it("resolves a relative --out against the directory the command ran in", async () => {
    const exported = await verbatra("export", "--out", "handoff.xlsx", "--json");
    const types = await verbatra("types", "--out", "messages.d.ts", "--json");
    const pseudo = await verbatra("pseudo", "--out", "pseudo.json", "--json");
    const tmx = await verbatra("tmx", "export", "memory.tmx", "--json");

    expect([exported.code, types.code, pseudo.code, tmx.code]).toEqual([0, 0, 0, 0]);
    expect(existsSync(join(nested, "handoff.xlsx"))).toBe(true);
    expect(existsSync(join(nested, "messages.d.ts"))).toBe(true);
    expect(existsSync(join(nested, "pseudo.json"))).toBe(true);
    expect(existsSync(join(nested, "memory.tmx"))).toBe(true);
  });

  it("resolves the import file and tmx file arguments against the directory the command ran in", async () => {
    await verbatra("export", "--out", "handoff.xlsx");
    await verbatra("tmx", "export", "memory.tmx");

    const imported = await verbatra("import", "handoff.xlsx", "--dry-run", "--json");
    const memory = await verbatra("tmx", "import", "memory.tmx", "--dry-run", "--json");

    expect(imported.code).toBe(0);
    expect(memory.code).toBe(0);
  });

  it("check --file resolves a relative path against the directory the command ran in", async () => {
    const result = await verbatra("check", "--file", "../../locales/de.json", "--json");

    expect(parseEnvelope(result.out).ok).toBe(true);
  });
});
