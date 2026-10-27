import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
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

const DECOY = JSON.stringify({ decoy: "Decoy" });

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
    mkdirSync(join(nested, "locales"), { recursive: true });
    writeFileSync(join(nested, "locales", "en.json"), DECOY);
    writeFileSync(join(nested, "locales", "de.json"), DECOY);
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
    expect(readFileSync(join(nested, "locales", "de.json"), "utf8")).toBe(DECOY);
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

  it("leaves a .gitignore symlink that leads outside the project unchanged and says so", async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-subdir-outside-")));
    try {
      writeFileSync(join(outside, "shared.gitignore"), "node_modules\n");
      rmSync(join(root, ".gitignore"));
      symlinkSync(join(outside, "shared.gitignore"), join(root, ".gitignore"));

      const result = await verbatra("translate");

      expect(result.err).toContain("left .gitignore unchanged");
      expect(readFileSync(join(outside, "shared.gitignore"), "utf8")).toBe("node_modules\n");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("roots a package's own config at that package when a repository config sits above it", async () => {
    const pkg = join(root, "packages", "a");
    mkdirSync(join(pkg, "locales"), { recursive: true });
    mkdirSync(join(pkg, "src"), { recursive: true });
    writeFileSync(
      join(pkg, ".verbatrarc.json"),
      JSON.stringify({
        sourceLocale: "en",
        targetLocales: ["fr"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "none" },
      }),
    );
    writeFileSync(join(pkg, "locales", "en.json"), JSON.stringify({ title: "Title" }));
    writeFileSync(join(pkg, "locales", "fr.json"), JSON.stringify({ title: "Titre" }));
    process.chdir(join(pkg, "src"));

    const result = await verbatra("check", "--json");

    expect(result.code).toBe(0);
    expect(parseEnvelope(result.out).result).toMatchObject({
      locales: [{ locale: "fr", missing: 0, upToDate: 1 }],
    });
  });

  it("notes that paths resolve against the working directory for a --config file elsewhere", async () => {
    const result = await verbatra("check", "--config", "../../.verbatrarc.json");

    expect(result.err).toContain(`--config names a file in ${root}`);
    expect(result.err).toContain("the glossary against the config's directory");
  });
});

describe("the .env files of a project run from a subdirectory", () => {
  let original: string;
  let savedKey: string | undefined;
  let root: string;

  beforeEach(() => {
    original = process.cwd();
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    root = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-subdir-env-")));
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(join(root, "locales"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, ".verbatrarc.json"),
      JSON.stringify({
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "anthropic", options: { model: "m", maxTokens: 256 } },
      }),
    );
    writeFileSync(join(root, "locales", "en.json"), JSON.stringify({ hello: "Hello" }));
    writeFileSync(join(root, "locales", "de.json"), JSON.stringify({ hello: "Hallo" }));
    writeFileSync(join(root, ".env"), "ANTHROPIC_API_KEY=from-the-project-root\n");
  });

  afterEach(() => {
    process.chdir(original);
    if (savedKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = savedKey;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("loads the key from the config directory's .env when the working directory has none", async () => {
    process.chdir(join(root, "src"));

    const result = await verbatra("doctor", "--json");
    const envelope = parseEnvelope(result.out) as {
      result: { checks: { id: string; status: string }[] };
    };

    expect(envelope.result.checks.find((check) => check.id === "api-key")?.status).toBe("pass");
  });

  it("lets the working directory's .env win over the config directory's", async () => {
    writeFileSync(join(root, "src", ".env"), "ANTHROPIC_API_KEY=from-the-working-directory\n");
    process.chdir(join(root, "src"));

    await verbatra("doctor", "--json");

    expect(process.env.ANTHROPIC_API_KEY).toBe("from-the-working-directory");
  });

  it("never reads the config directory's .env for an explicit --config", async () => {
    process.chdir(join(root, "src"));

    await verbatra("doctor", "--config", "../.verbatrarc.json", "--json");

    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
