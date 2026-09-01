import { mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  type ErrorEnvelope,
  JSON_ENVELOPE_VERSION,
  type JsonEnvelope,
  parseEnvelope,
  readEnvelopeStream,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  type Subprocess,
  spawnVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface CheckSummaryJson {
  inSync: boolean;
  locales: { locale: string; missing: number }[];
}

function expectSingleJsonDocument(stdout: string): void {
  expect(stdout).not.toContain("\n");
}

function expectSuccessPayload<TResult>(stdout: string, command: string): TResult {
  expectSingleJsonDocument(stdout);
  const envelope = parseEnvelope<TResult>(stdout);
  if (!envelope.ok) {
    throw new Error(
      `Expected a ${command} success envelope, got [${envelope.code}] ${envelope.message}`,
    );
  }
  expect(envelope.version).toBe(JSON_ENVELOPE_VERSION);
  expect(envelope.command).toBe(command);
  return envelope.result;
}

function expectErrorEnvelope(envelope: JsonEnvelope<unknown>, command: string): ErrorEnvelope {
  if (envelope.ok) {
    throw new Error(`Expected a ${command} error envelope, got a success record`);
  }
  expect(envelope.version).toBe(JSON_ENVELOPE_VERSION);
  expect(envelope.command).toBe(command);
  return envelope;
}

const HEADER_ROW = 1;
const TRANSLATION_COLUMN = 5;
const INSTRUCTIONS_SHEET = "Instructions";

let consumer: Consumer;

const i18nextConfig = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },
};

async function seedProject(
  name: string,
  config: unknown,
  locales: Record<string, unknown>,
): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", config);
  for (const [file, value] of Object.entries(locales)) {
    await writeJsonIn(dir, file, value);
  }
  return dir;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("packaging", () => {
  it("installs the verbatra binary and responds to --help", async () => {
    const result = await runVerbatra(consumer, ["--help"]);
    expect(result.exitCode).toBe(0);
    for (const command of ["translate", "watch", "check", "diff", "export", "import", "init"]) {
      expect(result.stdout).toContain(command);
    }
  });

  it("exposes the watch subcommand without needing a provider key", async () => {
    const result = await runVerbatra(consumer, ["watch", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--debounce");
  });
});

describe("check (read-only, no provider)", () => {
  it("exits 1 and counts the missing key when a target locale is behind", async () => {
    const dir = await seedProject("check-missing", i18nextConfig, {
      "locales/en.json": { greeting: "Hello {{name}}", farewell: "Goodbye" },
      "locales/de.json": { greeting: "Hallo {{name}}" },
    });
    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);
    expect(result.exitCode).toBe(1);
    const summary = expectSuccessPayload<CheckSummaryJson>(result.stdout, "check");
    expect(summary.inSync).toBe(false);
    const de = summary.locales.find((entry) => entry.locale === "de");
    expect(de?.missing).toBe(1);
  });

  it("exits 0 when every target locale is in sync", async () => {
    const dir = await seedProject("check-synced", i18nextConfig, {
      "locales/en.json": { greeting: "Hello {{name}}" },
      "locales/de.json": { greeting: "Hallo {{name}}" },
    });
    const result = await runVerbatra(consumer, ["check", "--cwd", dir]);
    expect(result.exitCode).toBe(0);
  });
});

describe("diff (read-only, no provider)", () => {
  it("exits 1 and lists the key that would be added", async () => {
    const dir = await seedProject("diff-pending", i18nextConfig, {
      "locales/en.json": { greeting: "Hello {{name}}", farewell: "Goodbye" },
      "locales/de.json": { greeting: "Hallo {{name}}" },
    });
    const result = await runVerbatra(consumer, ["diff", "--json", "--cwd", dir]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("farewell");
  });
});

describe("export (read-only, no provider)", () => {
  it("writes a workbook of untranslated strings", async () => {
    const dir = await seedProject("export-wb", i18nextConfig, {
      "locales/en.json": { greeting: "Hello {{name}}", farewell: "Goodbye" },
      "locales/de.json": { greeting: "Hallo {{name}}" },
    });
    const out = join(dir, "verbatra-translations.xlsx");
    const result = await runVerbatra(consumer, ["export", "--out", out, "--cwd", dir]);
    expect(result.exitCode).toBe(0);
    const { size } = await stat(out);
    expect(size).toBeGreaterThan(0);
  });
});

describe("translate --dry-run (no provider)", () => {
  it("previews the missing key without a key, a provider call, or a write", async () => {
    const dir = await seedProject("translate-dry-run", i18nextConfig, {
      "locales/en.json": { greeting: "Hello {{name}}", farewell: "Goodbye" },
      "locales/de.json": { greeting: "Hallo {{name}}" },
    });
    const result = await runVerbatra(consumer, ["translate", "--dry-run", "--json", "--cwd", dir]);
    expect(result.exitCode).toBe(0);

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    expect(de.farewell).toBeUndefined();
  });
});

describe("export then import round-trip (no provider)", () => {
  it("applies a human-filled workbook back into the locale files", async () => {
    const dir = await seedProject("import-roundtrip", i18nextConfig, {
      "locales/en.json": { greeting: "Hello {{name}}", farewell: "Goodbye" },
      "locales/de.json": { greeting: "Hallo {{name}}" },
    });
    const workbookPath = join(dir, "verbatra-translations.xlsx");
    const exported = await runVerbatra(consumer, ["export", "--out", workbookPath, "--cwd", dir]);
    expect(exported.exitCode).toBe(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(workbookPath);
    for (const sheet of workbook.worksheets) {
      if (sheet.name === INSTRUCTIONS_SHEET) {
        continue;
      }
      const headers: string[] = [];
      sheet.getRow(HEADER_ROW).eachCell((cell) => {
        headers.push(String(cell.value));
      });
      expect(headers).toContain("Review status");
      expect(headers).toContain("Review reasons");
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === HEADER_ROW) {
          return;
        }
        row.getCell(TRANSLATION_COLUMN).value = "Auf Wiedersehen";
      });
    }
    await workbook.xlsx.writeFile(workbookPath);

    const imported = await runVerbatra(consumer, ["import", workbookPath, "--cwd", dir]);
    expect(imported.exitCode).toBe(0);

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    expect(de.farewell).toBe("Auf Wiedersehen");
    expect(de.greeting).toContain("{{name}}");

    const checked = await runVerbatra(consumer, ["check", "--cwd", dir]);
    expect(checked.exitCode).toBe(0);
  });
});

describe("a locale whose directory does not exist yet", () => {
  it("imports into a nested per-locale path, creating the directory, and exits 1 because overwriting every row with one value drops a placeholder and leaves the locale partial", async () => {
    const dir = await seedProject(
      "nested-locale-path",
      { ...i18nextConfig, files: { pattern: "locales/{locale}/common.json" } },
      { "locales/en/common.json": { greeting: "Hello {{name}}", farewell: "Goodbye" } },
    );

    const workbookPath = join(dir, "verbatra-translations.xlsx");
    const exported = await runVerbatra(consumer, ["export", "--out", workbookPath, "--cwd", dir]);
    expect(exported.exitCode).toBe(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(workbookPath);
    for (const sheet of workbook.worksheets) {
      if (sheet.name === INSTRUCTIONS_SHEET) {
        continue;
      }
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === HEADER_ROW) {
          return;
        }
        row.getCell(TRANSLATION_COLUMN).value = "Auf Wiedersehen";
      });
    }
    await workbook.xlsx.writeFile(workbookPath);

    const imported = await runVerbatra(consumer, ["import", workbookPath, "--cwd", dir, "--json"]);
    expect(imported.exitCode).toBe(1);
    const summary = JSON.parse(imported.stdout) as {
      result: { succeeded: string[]; partial: string[]; failed: string[] };
    };
    expect(summary.result.partial).toEqual(["de"]);
    expect(summary.result.failed).toEqual([]);

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de/common.json");
    expect(de.farewell).toBe("Auf Wiedersehen");
  });
});

describe("other formats (read-only, no provider)", () => {
  it("checks a YAML project", async () => {
    const dir = await seedProject(
      "yaml-check",
      { ...i18nextConfig, format: "yaml", files: { pattern: "locales/{locale}.yml" } },
      {},
    );
    await writeFileIn(dir, "locales/en.yml", "greeting: Hello {{name}}\nfarewell: Goodbye\n");
    await writeFileIn(dir, "locales/de.yml", "greeting: Hallo {{name}}\n");
    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);
    expect(result.exitCode).toBe(1);
    const summary = expectSuccessPayload<CheckSummaryJson>(result.stdout, "check");
    expect(summary.inSync).toBe(false);
    const de = summary.locales.find((entry) => entry.locale === "de");
    expect(de?.missing).toBe(1);
  });

  it("reads a YAML target file with a stray non-string leaf instead of failing the whole file", async () => {
    const dir = await seedProject(
      "yaml-nonstring-leaf",
      { ...i18nextConfig, format: "yaml", files: { pattern: "locales/{locale}.yml" } },
      {},
    );
    await writeFileIn(dir, "locales/en.yml", "greeting: Hello {{name}}\nfarewell: Goodbye\n");
    await writeFileIn(dir, "locales/de.yml", "greeting: Hallo {{name}}\ncount: 5\nenabled: true\n");
    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);
    expect(result.exitCode).toBe(1);
    const summary = expectSuccessPayload<CheckSummaryJson>(result.stdout, "check");
    expect(summary.inSync).toBe(false);
    const de = summary.locales.find((entry) => entry.locale === "de");
    expect(de?.missing).toBe(1);
  });

  it("checks a Flutter ARB project", async () => {
    const dir = await seedProject(
      "arb-check",
      { ...i18nextConfig, format: "arb", files: { pattern: "lib/l10n/app_{locale}.arb" } },
      {},
    );
    await writeJsonIn(dir, "lib/l10n/app_en.arb", {
      "@@locale": "en",
      greeting: "Hello {name}",
      farewell: "Goodbye",
    });
    await writeJsonIn(dir, "lib/l10n/app_de.arb", { "@@locale": "de", greeting: "Hallo {name}" });
    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);
    expect(result.exitCode).toBe(1);
    const summary = expectSuccessPayload<CheckSummaryJson>(result.stdout, "check");
    expect(summary.inSync).toBe(false);
    const de = summary.locales.find((entry) => entry.locale === "de");
    expect(de?.missing).toBe(1);
  });

  it("checks a .properties project", async () => {
    const dir = await seedProject(
      "properties-check",
      { ...i18nextConfig, format: "properties", files: { pattern: "locales/{locale}.properties" } },
      {},
    );
    await writeFileIn(dir, "locales/en.properties", "greeting=Hello {0}\nfarewell=Goodbye {0}\n");
    await writeFileIn(dir, "locales/de.properties", "greeting=Hallo {0}\n");
    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);
    expect(result.exitCode).toBe(1);
    const summary = expectSuccessPayload<CheckSummaryJson>(result.stdout, "check");
    expect(summary.inSync).toBe(false);
    const de = summary.locales.find((entry) => entry.locale === "de");
    expect(de?.missing).toBe(1);
  });

  it("applies a human-filled workbook back into a .properties target file", async () => {
    const dir = await seedProject(
      "properties-roundtrip",
      { ...i18nextConfig, format: "properties", files: { pattern: "locales/{locale}.properties" } },
      {},
    );
    await writeFileIn(dir, "locales/en.properties", "greeting=Hello {0}\nfarewell=Goodbye {0}\n");
    await writeFileIn(dir, "locales/de.properties", "greeting=Hallo {0}\n");

    const workbookPath = join(dir, "verbatra-translations.xlsx");
    const exported = await runVerbatra(consumer, ["export", "--out", workbookPath, "--cwd", dir]);
    expect(exported.exitCode).toBe(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(workbookPath);
    for (const sheet of workbook.worksheets) {
      if (sheet.name === INSTRUCTIONS_SHEET) {
        continue;
      }
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === HEADER_ROW) {
          return;
        }
        row.getCell(TRANSLATION_COLUMN).value = "Auf Wiedersehen {0}";
      });
    }
    await workbook.xlsx.writeFile(workbookPath);

    const imported = await runVerbatra(consumer, ["import", workbookPath, "--cwd", dir]);
    expect(imported.exitCode).toBe(0);

    const de = await readFile(join(dir, "locales/de.properties"), "utf8");
    expect(de).toContain("Auf Wiedersehen {0}");

    const checked = await runVerbatra(consumer, ["check", "--cwd", dir]);
    expect(checked.exitCode).toBe(0);
  });
});

describe("init (no provider)", () => {
  it("scaffolds a config and env example for the chosen provider", async () => {
    const dir = join(consumer.dir, "init-scaffold");
    await mkdir(dir, { recursive: true });
    const result = await runVerbatra(consumer, [
      "init",
      "--yes",
      "--provider",
      "anthropic",
      "--source",
      "en",
      "--targets",
      "de,fr",
      "--cwd",
      dir,
    ]);
    expect(result.exitCode).toBe(0);

    const config = await readFile(join(dir, "verbatra.config.ts"), "utf8");
    expect(config).toContain("anthropic");
    expect(config).toContain("de");
    expect(config).toContain("fr");

    const envExample = await readFile(join(dir, ".env.example"), "utf8");
    expect(envExample).toContain("ANTHROPIC_API_KEY");
    expect(envExample).not.toMatch(/ANTHROPIC_API_KEY=.+\S/);
  });
});

describe("config errors (no provider)", () => {
  it("exits 2 with a config-not-found error when no config file is present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-e2e-noconfig-"));
    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);
    expect(result.exitCode).toBe(2);

    expectSingleJsonDocument(result.stdout);
    const envelope = expectErrorEnvelope(parseEnvelope(result.stdout), "check");
    expect(envelope.code).toBe("CONFIG_NOT_FOUND");
    expect(envelope.message).toContain("No verbatra configuration found");

    expect(result.stderr).toMatch(/\[CONFIG_NOT_FOUND\]/);
    expect(result.stderr).toContain("No verbatra configuration found");
  });
});

describe("CLI boundary hardening (subprocess-level proof, no provider)", () => {
  it("translate exits 2 with a structured error when .env is unreadable (a directory named .env)", async () => {
    const dir = await seedProject("env-eisdir", i18nextConfig, {
      "locales/en.json": { greeting: "Hello {{name}}" },
      "locales/de.json": { greeting: "Hallo {{name}}" },
    });
    await mkdir(join(dir, ".env"));

    const result = await runVerbatra(consumer, ["translate", "--cwd", dir]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toBe("");
  });

  it("watch --debounce 250ms exits 2 with a structured INVALID_DEBOUNCE error, never starts", async () => {
    const dir = await seedProject("debounce-invalid", i18nextConfig, {
      "locales/en.json": { greeting: "Hello {{name}}" },
      "locales/de.json": { greeting: "Hallo {{name}}" },
    });

    const result = await runVerbatra(consumer, ["watch", "--debounce", "250ms", "--cwd", dir]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("INVALID_DEBOUNCE");
  });

  it("check exits 2 with a structured CONFIG_INVALID error for a non-positive maxTokens", async () => {
    const dir = await seedProject(
      "budget-invalid",
      { ...i18nextConfig, maxTokens: 0 },
      {
        "locales/en.json": { greeting: "Hello {{name}}" },
        "locales/de.json": { greeting: "Hallo {{name}}" },
      },
    );

    const result = await runVerbatra(consumer, ["check", "--cwd", dir]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CONFIG_INVALID");
  });
});

describe("watch SIGINT contract (no provider key needed)", () => {
  it("exits 0 on a single interrupt after emitting at least one NDJSON record", async () => {
    const dir = join(consumer.dir, "watch-sigint");
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, "locales/en.json", { greeting: "Hello {{name}}" });
    await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo {{name}}" });
    await writeFileIn(
      dir,
      "verbatra.config.ts",
      `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },\n});\n`,
    );

    const watcher: Subprocess = spawnVerbatra(consumer, ["watch", "--json", "--cwd", dir], {
      env: { ANTHROPIC_API_KEY: "" },
    });
    const stream = readEnvelopeStream(watcher);

    try {
      const first = await stream.next({ timeoutMs: 30_000 });
      const failure = expectErrorEnvelope(first, "watch");
      expect(failure.code.length).toBeGreaterThan(0);
      expect(failure.message.length).toBeGreaterThan(0);

      watcher.kill("SIGINT");
      const result = await watcher;
      expect(result.signal).toBeUndefined();
      expect(result.exitCode).toBe(0);
    } finally {
      watcher.kill("SIGKILL");
    }
  }, 45_000);
});

describe("runVerbatra signal-death (no provider key needed)", () => {
  it("reports a null exit code and the killing signal when the process is force-killed", async () => {
    const dir = join(consumer.dir, "watch-signal-death");
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, "locales/en.json", { greeting: "Hello {{name}}" });
    await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo {{name}}" });
    await writeFileIn(
      dir,
      "verbatra.config.ts",
      `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },\n});\n`,
    );

    const result = await runVerbatra(consumer, ["watch", "--json", "--cwd", dir], {
      env: { ANTHROPIC_API_KEY: "" },
      timeoutMs: 3000,
    });

    expect(result.exitCode).toBeNull();
    expect(result.signal).toBe("SIGKILL");
  }, 20_000);
});
