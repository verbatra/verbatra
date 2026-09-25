import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportWorkbook, importWorkbook, loadConfig, loadConfigWithMeta } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "./run.js";
import {
  captureStreams,
  makeExportResult,
  makeImportTmxResult,
  recordingDeps,
} from "./test-support.js";
import type { CliDeps } from "./types.js";

const realDeps: Partial<CliDeps> = {
  loadConfig,
  loadConfigWithMeta,
  exportWorkbook,
  importWorkbook,
};

function writeProject(dir: string): void {
  mkdirSync(join(dir, "locales"), { recursive: true });
  writeFileSync(
    join(dir, "project.config.json"),
    JSON.stringify({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: "m", maxTokens: 256 } },
    }),
  );
  writeFileSync(join(dir, "locales", "en.json"), JSON.stringify({ greeting: "Hello" }));
  writeFileSync(join(dir, "locales", "de.json"), "{}");
}

function nextCommand(stderr: string): string {
  const line = stderr.split("\n").find((entry) => entry.startsWith("next: "));
  return line?.slice("next: ".length).split(" (")[0] ?? "";
}

async function runCommand(command: string) {
  const [program, ...argv] = command.split(" ");
  expect(program).toBe("verbatra");
  const cap = captureStreams();
  const code = await run(argv, recordingDeps(realDeps).deps, cap.streams);
  return { code, err: cap.err() };
}

describe("next: hints carry --cwd and --config so they run from where the command ran", () => {
  let parent: string;
  let original: string;

  beforeEach(() => {
    original = process.cwd();
    parent = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-hint-")));
    writeProject(join(parent, "proj"));
    process.chdir(parent);
  });

  afterEach(() => {
    process.chdir(original);
    rmSync(parent, { recursive: true, force: true });
  });

  it("export --cwd proj suggests an import that succeeds when run from the parent", async () => {
    const exported = await runCommand("verbatra export --cwd proj --config project.config.json");
    expect(exported.code).toBe(0);

    const hint = nextCommand(exported.err);
    expect(hint).toBe(
      "verbatra import verbatra-translations.xlsx --cwd proj --config project.config.json",
    );

    const dryRun = await runCommand(`${hint} --dry-run`);
    expect(dryRun.code).toBe(0);
    expect(nextCommand(dryRun.err)).toBe(hint);

    const imported = await runCommand(hint);
    expect(imported.code).toBe(0);
    expect(nextCommand(imported.err)).toBe(
      "verbatra check --cwd proj --config project.config.json",
    );
  });
  it.each(["csv", "tsv"])(
    "export --format %s suggests an import that keeps the format and succeeds",
    async (format) => {
      const exported = await runCommand(
        `verbatra export --format ${format} --cwd proj --config project.config.json`,
      );
      expect(exported.code).toBe(0);

      const hint = nextCommand(exported.err);
      expect(hint).toBe(
        `verbatra import verbatra-translations --format ${format} --cwd proj --config project.config.json`,
      );

      const dryRun = await runCommand(`${hint} --dry-run`);
      expect(dryRun.code).toBe(0);
      expect(nextCommand(dryRun.err)).toBe(hint);

      const imported = await runCommand(hint);
      expect(imported.code).toBe(0);
    },
  );
});

describe("next: hints for commands that take a file", () => {
  it("tmx import --dry-run repeats the file and the location flags", async () => {
    const cap = captureStreams();
    await run(
      ["tmx", "import", "legacy.tmx", "--dry-run", "--cwd", "proj"],
      recordingDeps({ importTmx: async () => makeImportTmxResult({ dryRun: true }) }).deps,
      cap.streams,
    );

    expect(nextCommand(cap.err())).toBe("verbatra tmx import legacy.tmx --cwd proj");
  });

  it("export names a file outside --cwd by its absolute path", async () => {
    const outside = join(tmpdir(), "elsewhere", "handoff.xlsx");
    const cap = captureStreams();
    await run(
      ["export", "--cwd", "proj"],
      recordingDeps({
        exportWorkbook: async () =>
          makeExportResult({ path: outside, locales: [{ locale: "de", rows: 1 }] }),
      }).deps,
      cap.streams,
    );

    expect(nextCommand(cap.err())).toBe(`verbatra import ${outside} --cwd proj`);
  });
});

describe("next: hints quote a location that a shell would split", () => {
  it.each([
    [["--cwd", "my proj"], "verbatra check --cwd 'my proj'"],
    [["--config", "it's.json"], "verbatra check --config 'it'\\''s.json'"],
  ])("%j", async (flags, expected) => {
    const cap = captureStreams();
    await run(["import", "handoff.xlsx", ...flags], recordingDeps().deps, cap.streams);

    expect(nextCommand(cap.err())).toBe(expected);
  });
});
