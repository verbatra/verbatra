import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  JSON_ENVELOPE_VERSION,
  parseEnvelope,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface ExtractResultJson {
  sourcePath: string;
  scannedFiles: number;
  added: { key: string; value: string; file: string; line: number }[];
  existingKeys: number;
  withoutDefault: string[];
  dynamic: { file: string; line: number }[];
  conflicts: { key: string; values: string[] }[];
  diagnostics: { file: string; reason: string }[];
  written: boolean;
  dryRun: boolean;
}

const extractConfig = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
  extract: { framework: "i18next", roots: ["src"] },
};

let consumer: Consumer;

function expectExtractPayload(stdout: string): ExtractResultJson {
  expect(stdout).not.toContain("\n");
  const envelope = parseEnvelope<ExtractResultJson>(stdout);
  if (!envelope.ok) {
    throw new Error(
      `Expected an extract success envelope, got [${envelope.code}] ${envelope.message}`,
    );
  }
  expect(envelope.version).toBe(JSON_ENVELOPE_VERSION);
  expect(envelope.command).toBe("extract");
  return envelope.result;
}

async function seedProject(
  name: string,
  sources: Record<string, string>,
  locales: Record<string, unknown> = {},
): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", extractConfig);
  for (const [file, content] of Object.entries(sources)) {
    await writeFileIn(dir, file, content);
  }
  for (const [file, value] of Object.entries(locales)) {
    await writeJsonIn(dir, file, value);
  }
  return dir;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("extract (no provider, no API key)", () => {
  it("is advertised by the binary's help", async () => {
    const result = await runVerbatra(consumer, ["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("extract");
  });

  it("creates the source locale file on a project that has no catalog yet", async () => {
    const dir = await seedProject("extract-create", {
      "src/nav.ts": 't("nav.home", "Home");\nt("nav.away");\n',
    });

    const result = await runVerbatra(consumer, ["extract", "--json", "--cwd", dir]);

    expect(result.exitCode).toBe(0);
    const payload = expectExtractPayload(result.stdout);
    expect(payload.written).toBe(true);
    expect(payload.added.map((entry) => entry.key)).toEqual(["nav.home", "nav.away"]);
    expect(payload.withoutDefault).toEqual(["nav.away"]);
    expect(await readJsonIn(dir, "locales/en.json")).toEqual({
      nav: { home: "Home", away: "" },
    });
  });

  it("never writes a target locale file", async () => {
    const dir = await seedProject("extract-source-only", {
      "src/nav.ts": 't("nav.home", "Home");\n',
    });

    const result = await runVerbatra(consumer, ["extract", "--cwd", dir]);

    expect(result.exitCode).toBe(0);
    expect(await readJsonIn(dir, "locales/en.json")).toEqual({ nav: { home: "Home" } });
    await expect(readJsonIn(dir, "locales/de.json")).rejects.toThrow();
  });

  it("keeps an existing value and adds only the new key", async () => {
    const dir = await seedProject(
      "extract-merge",
      { "src/nav.ts": 't("nav.home", "Ignored");\nt("nav.away", "Away");\n' },
      { "locales/en.json": { nav: { home: "Edited by hand" } } },
    );

    const result = await runVerbatra(consumer, ["extract", "--json", "--cwd", dir]);

    expect(result.exitCode).toBe(0);
    expect(expectExtractPayload(result.stdout).added.map((entry) => entry.key)).toEqual([
      "nav.away",
    ]);
    expect(await readJsonIn(dir, "locales/en.json")).toEqual({
      nav: { home: "Edited by hand", away: "Away" },
    });
  });

  it("adds nothing and writes nothing on a second run", async () => {
    const dir = await seedProject("extract-idempotent", {
      "src/nav.ts": 't("nav.home", "Home");\n',
    });

    await runVerbatra(consumer, ["extract", "--cwd", dir]);
    const result = await runVerbatra(consumer, ["extract", "--json", "--cwd", dir]);

    const payload = expectExtractPayload(result.stdout);
    expect(payload.added).toEqual([]);
    expect(payload.written).toBe(false);
    expect(payload.existingKeys).toBe(1);
  });

  it("previews with --dry-run and writes nothing", async () => {
    const dir = await seedProject("extract-dry-run", {
      "src/nav.ts": 't("nav.home", "Home");\n',
    });

    const result = await runVerbatra(consumer, ["extract", "--dry-run", "--json", "--cwd", dir]);

    const payload = expectExtractPayload(result.stdout);
    expect(payload.dryRun).toBe(true);
    expect(payload.written).toBe(false);
    expect(payload.added.map((entry) => entry.key)).toEqual(["nav.home"]);
    await expect(readJsonIn(dir, "locales/en.json")).rejects.toThrow();
  });

  it("reports dynamic keys and conflicting defaults without failing the run", async () => {
    const dir = await seedProject("extract-findings", {
      "src/a.ts": 't("nav.home", "Home");\nt(section);\n',
      "src/b.ts": 't("nav.home", "Start");\n',
    });

    const result = await runVerbatra(consumer, ["extract", "--json", "--cwd", dir]);

    expect(result.exitCode).toBe(0);
    const payload = expectExtractPayload(result.stdout);
    expect(payload.dynamic).toEqual([{ file: "src/a.ts", line: 2 }]);
    expect(payload.conflicts.map((entry) => entry.key)).toEqual(["nav.home"]);
    expect(payload.added).toEqual([]);
  });

  it("writes no catalog at all for a key or a default it cannot resolve whole", async () => {
    const dir = await seedProject("extract-partial-literals", {
      "src/nav.ts": 't("common:nav.home", "Home");\nt("user." + id);\n',
      "src/panel.ts": 't("panel.title", { defaultValue: "Panel" + suffix });\n',
    });

    const result = await runVerbatra(consumer, ["extract", "--json", "--cwd", dir]);

    expect(result.exitCode).toBe(0);
    const payload = expectExtractPayload(result.stdout);
    expect(payload.added).toEqual([
      { key: "panel.title", value: "", file: "src/panel.ts", line: 1 },
    ]);
    expect(payload.withoutDefault).toEqual(["panel.title"]);
    expect(payload.dynamic).toEqual([
      { file: "src/nav.ts", line: 1 },
      { file: "src/nav.ts", line: 2 },
    ]);
    expect(await readJsonIn(dir, "locales/en.json")).toEqual({ panel: { title: "" } });
  });

  it("exits 2 with a structured envelope when no extract block is configured", async () => {
    const dir = join(consumer.dir, "extract-unconfigured");
    await mkdir(dir, { recursive: true });
    const { extract: _extract, ...withoutExtract } = extractConfig;
    await writeJsonIn(dir, ".verbatrarc.json", withoutExtract);

    const result = await runVerbatra(consumer, ["extract", "--json", "--cwd", dir]);

    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope<unknown>(result.stdout);
    expect(envelope.ok).toBe(false);
    if (!envelope.ok) {
      expect(envelope.command).toBe("extract");
      expect(envelope.code).toBe("EXTRACT_NOT_CONFIGURED");
    }
  });
});
