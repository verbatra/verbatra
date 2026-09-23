import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { execa } from "execa";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface LocaleSummaryJson {
  locale: string;
  translated: string[];
  cacheHits: string[];
  unfilled: string[];
}

interface RunSummaryJson {
  locales: LocaleSummaryJson[];
  failed: string[];
  partial: string[];
}

interface DoctorJson {
  ok: boolean;
  checks: { id: string; status: string; detail: string }[];
}

const HEADER_ROW = 1;
const TRANSLATION_COLUMN = 5;
const INSTRUCTIONS_SHEET = "Instructions";
const NEEDS_HUMAN_EXIT_CODE = 3;

const NO_NETWORK_PRELOAD = [
  'import net from "node:net";',
  "const refuse = () => {",
  '  throw new Error("human-only e2e: a network call was attempted");',
  "};",
  "globalThis.fetch = refuse;",
  "net.Socket.prototype.connect = refuse;",
  "",
].join("\n");

const NO_KEYS: Record<string, string> = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEEPL_API_KEY: "",
  GOOGLE_TRANSLATE_API_KEY: "",
  OPENAI_COMPATIBLE_API_KEY: "",
};

let consumer: Consumer;
let offlineEnv: Record<string, string>;

beforeAll(async () => {
  consumer = await readSharedConsumer();
  const preloadDir = join(consumer.dir, "human-only-preload");
  await writeFileIn(preloadDir, "no-network.mjs", NO_NETWORK_PRELOAD);
  const preloadUrl = pathToFileURL(join(preloadDir, "no-network.mjs")).href;
  offlineEnv = { ...NO_KEYS, NODE_OPTIONS: `--import ${preloadUrl}` };
}, 180_000);

function successResult<TResult>(stdout: string, command: string): TResult {
  const envelope = parseEnvelope<TResult>(stdout);
  if (!envelope.ok) {
    throw new Error(`Expected a ${command} success envelope, got [${envelope.code}]`);
  }
  expect(envelope.command).toBe(command);
  return envelope.result;
}

async function fillEveryRow(workbookPath: string, value: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  for (const sheet of workbook.worksheets) {
    if (sheet.name === INSTRUCTIONS_SHEET) {
      continue;
    }
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber !== HEADER_ROW) {
        row.getCell(TRANSLATION_COLUMN).value = value;
      }
    });
  }
  await workbook.xlsx.writeFile(workbookPath);
}

describe("human-only workflow (provider none, no key, no network)", () => {
  it("scaffolds, hands off, imports, and checks green without ever calling a provider", async () => {
    const dir = join(consumer.dir, "human-only-workflow");
    await mkdir(dir, { recursive: true });
    const run = (args: string[]) =>
      runVerbatra(consumer, [...args, "--cwd", dir], { env: offlineEnv });

    const init = await run(["init", "--yes", "--provider", "none", "--targets", "de"]);
    expect(init.exitCode).toBe(0);
    const config = await readFile(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain('id: "none"');
    await expect(access(join(dir, ".env.example"))).rejects.toThrow();

    await writeJsonIn(dir, "locales/en.json", { greeting: "Hello", farewell: "Goodbye" });

    const doctor = await run(["doctor", "--json"]);
    expect(doctor.exitCode).toBe(0);
    const report = successResult<DoctorJson>(doctor.stdout, "doctor");
    expect(report.checks.find((check) => check.id === "provider")?.detail).toContain(
      "Machine translation disabled by policy",
    );

    const translated = await run(["translate", "--json"]);
    expect(translated.exitCode).toBe(NEEDS_HUMAN_EXIT_CODE);
    const summary = successResult<RunSummaryJson>(translated.stdout, "translate");
    expect(summary.failed).toEqual([]);
    expect(summary.locales[0]?.translated).toEqual([]);
    expect(summary.locales[0]?.unfilled).toEqual(["farewell", "greeting"]);
    expect(translated.stderr).toContain("2 keys need a human translation");

    const workbookPath = join(dir, "handoff.xlsx");
    const exported = await run(["export", "--out", workbookPath]);
    expect(exported.exitCode).toBe(0);

    await fillEveryRow(workbookPath, "Von Hand");
    const imported = await run(["import", workbookPath]);
    expect(imported.exitCode).toBe(0);
    expect(await readJsonIn<Record<string, string>>(dir, "locales/de.json")).toEqual({
      greeting: "Von Hand",
      farewell: "Von Hand",
    });

    const checked = await run(["check"]);
    expect(checked.exitCode).toBe(0);

    const settled = await run(["translate"]);
    expect(settled.exitCode).toBe(0);
    expect(settled.stderr).not.toContain("network call was attempted");
  });

  it("runs under a network guard that is really live, so the no-network claim is not vacuous", async () => {
    const probe = await execa(process.execPath, ["-e", "fetch('http://127.0.0.1:9/')"], {
      env: { ...process.env, ...offlineEnv },
      reject: false,
    });

    expect(probe.exitCode).not.toBe(0);
    expect(probe.stderr).toContain("network call was attempted");
  });
});
