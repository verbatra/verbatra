import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  check,
  checkFile,
  diff,
  doctor,
  exportTmx,
  exportWorkbook,
  extract,
  generateTypes,
  importTmx,
  importWorkbook,
  jsonSchemaUrl,
  loadConfig,
  loadConfigWithMeta,
  provenanceReport,
  pseudolocalize,
  renderJsonSchemas,
  SDK_JSON_SCHEMAS,
  translate,
} from "@verbatra/sdk";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { InitResult } from "./init.js";
import type { initResultSchema } from "./init-schema.js";
import type { ErrorEnvelope, SuccessEnvelope } from "./json-envelope.js";
import {
  CLI_JSON_SCHEMAS,
  COMMAND_RESULT_SCHEMAS,
  type errorEnvelopeSchema,
  type interruptedRecordSchema,
  successEnvelopeSchema,
} from "./json-envelope-schema.js";
import { type InterruptedRecord, renderInterrupted, renderLockWaitJson } from "./render.js";
import { run } from "./run.js";
import { captureStreams, recordingDeps } from "./test-support.js";
import type { CliDeps } from "./types.js";

describe("the CLI-owned schemas are pinned both ways to the shapes the CLI prints", () => {
  it("pins the init result and the interrupted record", () => {
    expectTypeOf<z.output<typeof initResultSchema>>().toExtend<InitResult>();
    expectTypeOf<InitResult>().toExtend<z.output<typeof initResultSchema>>();
    expectTypeOf<z.output<typeof interruptedRecordSchema>>().toExtend<InterruptedRecord>();
    expectTypeOf<InterruptedRecord>().toExtend<z.output<typeof interruptedRecordSchema>>();
  });

  it("pins the envelopes, with the version and command narrowed to what v1 prints", () => {
    const checkEnvelope = successEnvelopeSchema("check", COMMAND_RESULT_SCHEMAS.check);
    type CheckResult = z.output<typeof COMMAND_RESULT_SCHEMAS.check>;

    expectTypeOf<z.output<typeof errorEnvelopeSchema>>().toExtend<ErrorEnvelope>();
    expectTypeOf<ErrorEnvelope & { readonly version: 1 }>().toExtend<
      z.output<typeof errorEnvelopeSchema>
    >();
    expectTypeOf<z.output<typeof checkEnvelope>>().toExtend<SuccessEnvelope<CheckResult>>();
    expectTypeOf<
      SuccessEnvelope<CheckResult> & { readonly version: 1; readonly command: "check" }
    >().toExtend<z.output<typeof checkEnvelope>>();
  });
});

const documents = renderJsonSchemas(CLI_JSON_SCHEMAS, SDK_JSON_SCHEMAS);
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
for (const document of Object.values({ ...renderJsonSchemas(SDK_JSON_SCHEMAS), ...documents })) {
  ajv.addSchema(document);
}

function validate(name: string, value: unknown): string {
  const validator = ajv.getSchema(jsonSchemaUrl(name));
  if (validator === undefined) {
    throw new Error(`no schema named ${name}`);
  }
  return validator(value) ? "valid" : ajv.errorsText(validator.errors);
}

const realDeps: Partial<CliDeps> = {
  loadConfig,
  loadConfigWithMeta,
  translate,
  exportWorkbook,
  importWorkbook,
  check,
  checkFile,
  diff,
  doctor,
  pseudolocalize,
  extract,
  generateTypes,
  importTmx,
  exportTmx,
  provenanceReport,
};

interface Ran {
  readonly argv: readonly string[];
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

function writeProject(dir: string): void {
  mkdirSync(join(dir, "locales"), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "project.config.json"),
    JSON.stringify({
      sourceLocale: "en",
      targetLocales: ["de", "fr"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: "m", maxTokens: 256 } },
      extract: { framework: "i18next", roots: ["src"] },
    }),
  );
  writeFileSync(
    join(dir, "locales", "en.json"),
    JSON.stringify({ greeting: "Hello {{name}}", farewell: "Goodbye" }),
  );
  writeFileSync(join(dir, "locales", "de.json"), JSON.stringify({ greeting: "Hallo {{name}}" }));
  writeFileSync(
    join(dir, "src", "app.tsx"),
    'export const App = () => <p title="Untranslated">{t("greeting")} {t("added", "Added")}</p>;\n',
  );
}

const PROJECT_COMMANDS: readonly (readonly string[])[] = [
  ["translate", "--dry-run"],
  ["translate", "--estimate"],
  ["export"],
  ["import", "verbatra-translations.xlsx", "--dry-run"],
  ["tmx", "export"],
  ["tmx", "import", "--dry-run"],
  ["check", "--qa", "--consistency", "--sensitive"],
  ["check", "--file", "locales/de.json"],
  ["diff", "--unused"],
  ["report", "provenance"],
  ["pseudo"],
  ["types"],
  ["doctor"],
  ["doctor", "--data-flow"],
  ["doctor", "--literals"],
  ["extract", "--dry-run"],
];

describe("every --json document a command prints validates against its published schema", () => {
  let parent: string;
  const ran: Ran[] = [];

  async function runJson(argv: readonly string[]): Promise<void> {
    const cap = captureStreams();
    const code = await run([...argv, "--json"], recordingDeps(realDeps).deps, cap.streams);
    ran.push({ argv, code, out: cap.out(), err: cap.err() });
  }

  beforeAll(async () => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-json-schemas-")));
    const project = join(parent, "project");
    writeProject(project);
    const location = ["--cwd", project, "--config", "project.config.json"];
    for (const argv of PROJECT_COMMANDS) {
      await runJson([...argv, ...location]);
    }
    await runJson(["check", "--cwd", project, "--config", "missing.config.json"]);
    const fresh = join(parent, "fresh");
    mkdirSync(join(fresh, "locales"), { recursive: true });
    writeFileSync(join(fresh, "locales", "en.json"), JSON.stringify({ greeting: "Hello" }));
    await runJson([
      "init",
      "--yes",
      "--agent",
      "--provider",
      "deepl",
      "--format",
      "i18next-json",
      "--targets",
      "de",
      "--cwd",
      fresh,
    ]);
  }, 60_000);

  afterAll(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  it("gets a success envelope from every fixture command, so each command's own schema is used", () => {
    const failures = ran
      .filter((entry) => !entry.argv.includes("missing.config.json"))
      .filter((entry) => (JSON.parse(entry.out) as { ok: boolean }).ok !== true)
      .map((entry) => `${entry.argv.join(" ")}: ${entry.out}`);

    expect(failures).toEqual([]);
  });

  it("ran every command it set out to, each printing exactly one document", () => {
    expect(ran.map((entry) => entry.argv[0])).toEqual([
      ...PROJECT_COMMANDS.map((argv) => argv[0]),
      "check",
      "init",
    ]);
    for (const entry of ran) {
      expect(entry.out.trim().split("\n"), entry.argv.join(" ")).toHaveLength(1);
    }
  });

  it("validates each stdout document against the envelope schema and its command's own", () => {
    for (const entry of ran) {
      const envelope = JSON.parse(entry.out) as { ok: boolean; command: string };
      const label = `${entry.argv.join(" ")} (exit ${entry.code})`;
      const own = envelope.ok ? `${envelope.command}-envelope` : "error-envelope";

      expect(validate("envelope", envelope), label).toBe("valid");
      expect(validate(own, envelope), label).toBe("valid");
    }
  });

  it("prints the error envelope for a run that cannot load its config", () => {
    const failed = ran.find((entry) => entry.argv.includes("missing.config.json"));

    expect(failed?.code).toBe(2);
    expect(JSON.parse(failed?.out ?? "{}")).toMatchObject({ ok: false, command: "check" });
  });

  it("validates every JSON line a command writes to stderr against the stderr record schema", () => {
    const records = ran.flatMap((entry) =>
      entry.err
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as unknown),
    );

    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(validate("stderr-record", record), JSON.stringify(record)).toBe("valid");
    }
  });
});

describe("the stderr records no fixture run prints", () => {
  it("validates the lock-wait record and every interrupted record", () => {
    const records = [
      renderLockWaitJson({
        lockPath: "/p/.verbatra/locks/de.lock",
        elapsedMs: 5000,
        holder: { pid: 7, hostname: "h", acquiredAt: "2026-10-06T00:00:00.000Z" },
      }),
      renderInterrupted("SIGINT", true, { status: "released" }),
      renderInterrupted("SIGTERM", true, { status: "failed", message: "denied" }),
      renderInterrupted("SIGINT", true, { status: "timed-out", deadlineMs: 5000 }),
    ];

    for (const record of records) {
      expect(validate("stderr-record", JSON.parse(record)), record).toBe("valid");
    }
  });

  it("rejects a record of a type it does not know, so the union is not open-ended", () => {
    expect(validate("stderr-record", { type: "unknown-record" })).not.toBe("valid");
  });
});

describe("CLI_JSON_SCHEMAS", () => {
  it("publishes one envelope per command that prints one, next to the shared documents", () => {
    expect(CLI_JSON_SCHEMAS.map((document) => document.name).sort()).toEqual(
      [
        "envelope",
        "error-envelope",
        "init-result",
        "stderr-record",
        ...Object.keys(COMMAND_RESULT_SCHEMAS).map((command) => `${command}-envelope`),
      ].sort(),
    );
  });

  it("points each envelope's result at the SDK document by its URL rather than copying it", () => {
    expect(documents["diff-envelope"]?.properties).toMatchObject({
      command: { const: "diff" },
      result: { $ref: jsonSchemaUrl("diff-summary") },
    });
    expect(documents["init-envelope"]?.properties).toMatchObject({
      result: { $ref: jsonSchemaUrl("init-result") },
    });
  });
});
