import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PROVIDER_ENV } from "@verbatra/ai-providers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { doctor } from "./doctor.js";

const { providerFactoryCalls } = vi.hoisted(() => ({ providerFactoryCalls: [] as string[] }));

vi.mock("@verbatra/ai-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbatra/ai-providers")>();
  const trap = (name: string) => (): never => {
    providerFactoryCalls.push(name);
    throw new Error(`${name} must never be called by the literal scan`);
  };
  return {
    ...actual,
    createAnthropicProvider: trap("createAnthropicProvider"),
    createOpenAiProvider: trap("createOpenAiProvider"),
    createGeminiProvider: trap("createGeminiProvider"),
    createDeepLProvider: trap("createDeepLProvider"),
    createOpenAiCompatibleProvider: trap("createOpenAiCompatibleProvider"),
  };
});

let projectDir: string;

async function writeProjectFile(relativePath: string, content: string): Promise<void> {
  const path = join(projectDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function writeConfig(extract: Record<string, unknown> | undefined): Promise<void> {
  await writeProjectFile(
    ".verbatrarc.json",
    JSON.stringify({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: "claude-test", maxTokens: 1024 } },
      ...(extract !== undefined ? { extract } : {}),
    }),
  );
}

const EXTRACT = { framework: "i18next", roots: ["src"] };

beforeEach(async () => {
  providerFactoryCalls.length = 0;
  projectDir = await mkdtemp(join(tmpdir(), "verbatra-doctor-literals-"));
  for (const name of Object.values(PROVIDER_ENV)) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(projectDir, { recursive: true, force: true });
});

describe("doctor with literals: a clean project", () => {
  it("reports zero findings and passes with no API key set", async () => {
    await writeConfig(EXTRACT);
    await writeProjectFile("src/app.tsx", 'export const A = () => <p>{t("home.title")}</p>;');

    const result = await doctor({ cwd: projectDir, literals: true });

    expect(result.ok).toBe(true);
    expect(result.checks.map((entry) => [entry.id, entry.status])).toEqual([
      ["config", "pass"],
      ["untranslated-literals", "pass"],
    ]);
    expect(result.literals).toEqual({
      scannedFiles: 1,
      findings: [],
      suppressed: [],
      diagnostics: [],
    });
    expect(result.checks[1]?.detail).toBe(
      "Scanned 1 source file: 0 untranslated literals found (0 suppressed).",
    );
  });
});

describe("doctor with literals: a project with findings", () => {
  it("fails and reports every finding with its file, line, and column", async () => {
    await writeConfig(EXTRACT);
    await writeProjectFile("src/app.tsx", "export const A = () => (\n  <p>Hello world</p>\n);");
    await writeProjectFile("src/copy.ts", 'export const b = "Welcome back";');

    const result = await doctor({ cwd: projectDir, literals: true });

    expect(result.ok).toBe(false);
    expect(result.literals?.findings).toEqual([
      { file: "src/app.tsx", line: 2, column: 6, text: "Hello world", truncated: false },
      { file: "src/copy.ts", line: 1, column: 18, text: "Welcome back", truncated: false },
    ]);
    expect(result.checks[1]).toMatchObject({
      id: "untranslated-literals",
      title: "Untranslated literals",
      status: "fail",
      detail: "Scanned 2 source files: 2 untranslated literals found (0 suppressed).",
    });
  });

  it("accounts for literals held back by the configured ignore list and by a comment", async () => {
    await writeConfig({ ...EXTRACT, literals: { ignore: ["Welcome back"] } });
    await writeProjectFile(
      "src/copy.ts",
      'export const b = "Welcome back";\n// verbatra-ignore-next-line\nexport const c = "See you soon";',
    );

    const result = await doctor({ cwd: projectDir, literals: true });

    expect(result.ok).toBe(true);
    expect(result.literals?.suppressed.map((entry) => [entry.text, entry.reason])).toEqual([
      ["Welcome back", "ignore-list"],
      ["See you soon", "directive"],
    ]);
    expect(result.checks[1]?.detail).toBe(
      "Scanned 1 source file: 0 untranslated literals found (2 suppressed).",
    );
  });
});

describe("doctor with literals: which source it reads", () => {
  it("skips the directory names the extract block excludes", async () => {
    await writeConfig({ ...EXTRACT, exclude: ["generated"] });
    await writeProjectFile("src/generated/copy.ts", 'export const b = "Welcome back";');
    await writeProjectFile("src/app.ts", "export const a = 1;");

    const result = await doctor({ cwd: projectDir, literals: true });

    expect(result.ok).toBe(true);
    expect(result.literals?.scannedFiles).toBe(1);
  });
});

describe("doctor with literals: what it never does", () => {
  it("never modifies a source file", async () => {
    await writeConfig(EXTRACT);
    const content = 'export const b = "Welcome back";\n';
    await writeProjectFile("src/copy.ts", content);
    const before = await stat(join(projectDir, "src/copy.ts"));
    const writes: string[] = [];
    const recordingFs: SdkFs = {
      ...defaultFs,
      writeFile: async (path) => {
        writes.push(path);
      },
      writeBytes: async (path) => {
        writes.push(path);
      },
      createExclusive: async (path) => {
        writes.push(path);
        return true;
      },
      deleteFile: async (path) => {
        writes.push(path);
      },
      mkdir: async (path) => {
        writes.push(path);
      },
    };

    await doctor({ cwd: projectDir, literals: true }, { fs: recordingFs });

    expect(writes).toEqual([]);
    expect(await readFile(join(projectDir, "src/copy.ts"), "utf8")).toBe(content);
    expect((await stat(join(projectDir, "src/copy.ts"))).mtimeMs).toBe(before.mtimeMs);
  });

  it("never constructs a provider and never reads an API key environment variable", async () => {
    await writeConfig(EXTRACT);
    await writeProjectFile("src/copy.ts", 'export const b = "Welcome back";');
    const keyNames = new Set<string>(Object.values(PROVIDER_ENV));
    const reads: string[] = [];
    const originalEnv = process.env;
    process.env = new Proxy(originalEnv, {
      get(target, property, receiver) {
        if (typeof property === "string" && keyNames.has(property)) {
          reads.push(property);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    try {
      await doctor({ cwd: projectDir, literals: true });
      await doctor({ cwd: projectDir });
    } finally {
      process.env = originalEnv;
    }

    expect(providerFactoryCalls).toEqual([]);
    expect(reads).toEqual(["ANTHROPIC_API_KEY"]);
  });
});

describe("doctor with literals: when the scan cannot give a clean verdict", () => {
  it("reports an unparseable file as a diagnostic, scans the rest, and does not pass", async () => {
    await writeConfig(EXTRACT);
    await writeProjectFile("src/broken.tsx", "export const A = () => <p>never closed");
    await writeProjectFile("src/fine.ts", "export const b = 1;");

    const result = await doctor({ cwd: projectDir, literals: true });

    expect(result.ok).toBe(false);
    expect(result.literals?.scannedFiles).toBe(2);
    expect(result.literals?.findings).toEqual([]);
    expect(result.literals?.diagnostics).toEqual([
      { file: "src/broken.tsx", reason: "unparseable" },
    ]);
    expect(result.checks[1]?.detail).toBe(
      "Scanned 2 source files: 0 untranslated literals found (0 suppressed, 1 path could not be scanned).",
    );
  });

  it("fails naming the extract block when none is configured", async () => {
    await writeConfig(undefined);

    const result = await doctor({ cwd: projectDir, literals: true });

    expect(result.ok).toBe(false);
    expect(result.literals).toBeUndefined();
    expect(result.checks[1]).toMatchObject({ status: "fail" });
    expect(result.checks[1]?.detail).toContain("No extract block is configured");
  });

  it("fails when the file system cannot list directories", async () => {
    await writeConfig(EXTRACT);
    const { readDirectory: _omitted, ...withoutListing } = defaultFs;

    const result = await doctor({ cwd: projectDir, literals: true }, { fs: withoutListing });

    expect(result.ok).toBe(false);
    expect(result.checks[1]?.detail).toContain("readDirectory");
  });

  it("skips the scan when the config cannot be loaded", async () => {
    const result = await doctor({ cwd: projectDir, literals: true });

    expect(result.ok).toBe(false);
    expect(result.literals).toBeUndefined();
    expect(result.checks.map((entry) => [entry.id, entry.status])).toEqual([
      ["config", "fail"],
      ["untranslated-literals", "skipped"],
    ]);
  });

  it("does not run the scan on a setup run", async () => {
    await writeConfig(EXTRACT);
    await writeProjectFile("src/copy.ts", 'export const b = "Welcome back";');

    const result = await doctor({ cwd: projectDir });

    expect(result.literals).toBeUndefined();
    expect(result.checks.map((entry) => entry.id)).not.toContain("untranslated-literals");
  });
});
