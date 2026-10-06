import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CreateWatcher,
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
  ProviderError,
  provenanceReport,
  pseudolocalize,
  renderJsonSchemas,
  SDK_JSON_SCHEMAS,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
  translate,
  watch,
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
import type { CliDeps, Session } from "./types.js";

type KnownKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

type OptionalKeys<T> = {
  [K in KnownKeys<T> & keyof T]-?: Partial<Pick<T, K>> extends Pick<T, K> ? K : never;
}[KnownKeys<T> & keyof T];

type KeyShape<T> = T extends readonly (infer Element)[]
  ? KeyShape<Element>
  : T extends object
    ? {
        readonly keys: KnownKeys<T>;
        readonly optional: OptionalKeys<T>;
        readonly fields: { [K in KnownKeys<T> & keyof T]: KeyShape<Exclude<T[K], undefined>> };
      }
    : "leaf";

describe("the CLI-owned schemas are pinned both ways to the shapes the CLI prints", () => {
  it("pins the init result and the interrupted record, optional fields included", () => {
    expectTypeOf<z.output<typeof initResultSchema>>().toExtend<InitResult>();
    expectTypeOf<InitResult>().toExtend<z.output<typeof initResultSchema>>();
    expectTypeOf<KeyShape<z.output<typeof initResultSchema>>>().toEqualTypeOf<
      KeyShape<InitResult>
    >();
    expectTypeOf<z.output<typeof interruptedRecordSchema>>().toExtend<InterruptedRecord>();
    expectTypeOf<InterruptedRecord>().toExtend<z.output<typeof interruptedRecordSchema>>();
    expectTypeOf<KeyShape<z.output<typeof interruptedRecordSchema>>>().toEqualTypeOf<
      KeyShape<InterruptedRecord>
    >();
  });

  it("pins the envelopes, with the version and command narrowed to what v1 prints", () => {
    const checkEnvelope = successEnvelopeSchema("check", COMMAND_RESULT_SCHEMAS.check);
    type CheckResult = z.output<typeof COMMAND_RESULT_SCHEMAS.check>;

    expectTypeOf<z.output<typeof errorEnvelopeSchema>>().toExtend<ErrorEnvelope>();
    expectTypeOf<ErrorEnvelope & { readonly version: 1 }>().toExtend<
      z.output<typeof errorEnvelopeSchema>
    >();
    expectTypeOf<KeyShape<z.output<typeof errorEnvelopeSchema>>>().toEqualTypeOf<
      KeyShape<ErrorEnvelope>
    >();
    expectTypeOf<z.output<typeof checkEnvelope>>().toExtend<SuccessEnvelope<CheckResult>>();
    expectTypeOf<
      SuccessEnvelope<CheckResult> & { readonly version: 1; readonly command: "check" }
    >().toExtend<z.output<typeof checkEnvelope>>();
    expectTypeOf<KeyShape<z.output<typeof checkEnvelope>>>().toEqualTypeOf<
      KeyShape<SuccessEnvelope<CheckResult>>
    >();
  });
});

type JsonDocument = Readonly<Record<string, unknown>>;

function readSchemaDirectory(directory: string): Record<string, JsonDocument> {
  return Object.fromEntries(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => [
        file.slice(0, -".json".length),
        JSON.parse(readFileSync(join(directory, file), "utf8")) as JsonDocument,
      ]),
  );
}

const SDK_SCHEMA_DIR = join(
  dirname(createRequire(import.meta.url).resolve("@verbatra/sdk/package.json")),
  "dist",
  "schemas",
);
const CLI_SCHEMA_DIR = fileURLToPath(new URL("../dist/schemas", import.meta.url));

const emitted = {
  ...readSchemaDirectory(SDK_SCHEMA_DIR),
  ...readSchemaDirectory(CLI_SCHEMA_DIR),
};

function isOpenObject(node: Record<string, unknown>): boolean {
  const extra = node.additionalProperties;
  return (
    typeof node.properties === "object" &&
    node.propertyNames === undefined &&
    (extra === undefined ||
      (typeof extra === "object" && extra !== null && Object.keys(extra).length === 0))
  );
}

function closeObjects(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(closeObjects);
  }
  if (typeof node !== "object" || node === null) {
    return node;
  }
  const record = node as Record<string, unknown>;
  const closed = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, closeObjects(value)]),
  );
  return isOpenObject(record) ? { ...closed, additionalProperties: false } : closed;
}

function validatorFor(documents: readonly unknown[]) {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  for (const document of documents) {
    ajv.addSchema(document as object);
  }
  return (name: string, value: unknown): string => {
    const validator = ajv.getSchema(jsonSchemaUrl(name));
    if (validator === undefined) {
      throw new Error(`no schema named ${name}`);
    }
    return validator(value) ? "valid" : ajv.errorsText(validator.errors);
  };
}

const validate = validatorFor(Object.values(emitted));
const validateClosed = validatorFor(
  Object.values(emitted).map((document) => closeObjects(document)),
);

function validateBoth(name: string, value: unknown): readonly [string, string] {
  return [validate(name, value), validateClosed(name, value)];
}

describe("the schemas the build emits", () => {
  it("are exactly what the source renders, for the sdk and the cli", () => {
    expect(emitted).toEqual({
      ...renderJsonSchemas(SDK_JSON_SCHEMAS),
      ...renderJsonSchemas(CLI_JSON_SCHEMAS, SDK_JSON_SCHEMAS),
    });
  });

  it("catch an undeclared field once the objects are closed, which the open ones accept", () => {
    const envelope = { ok: false, version: 1, command: "check", code: "X", message: "m", extra: 1 };

    expect(validate("error-envelope", envelope)).toBe("valid");
    expect(validateClosed("error-envelope", envelope)).not.toBe("valid");
  });

  it("list the codes this release knows as an editor hint, while any code string stays valid", () => {
    const properties = emitted["error-envelope"]?.properties as
      | Record<string, { anyOf?: unknown[] }>
      | undefined;
    const code = properties?.code;

    expect(code?.anyOf).toEqual([
      expect.objectContaining({
        enum: expect.arrayContaining(["CONFIG_NOT_FOUND", "USAGE_ERROR"]),
      }),
      { type: "string" },
    ]);
    expect(
      validate("error-envelope", {
        ok: false,
        version: 1,
        command: null,
        code: "NEW_CODE",
        message: "m",
      }),
    ).toBe("valid");
  });
});

const ENTRY_STATUS = { matches: true, missing: [], extra: [], reordered: false } as const;

const stubProvider: TranslationProvider = {
  id: "stub",
  kind: "llm",
  supportsGlossary: true,
  async translateBatch(request: TranslateRequest): Promise<TranslateResult> {
    if (request.targetLocale === "fr") {
      throw new ProviderError("AUTH_FAILED", "the stub refuses French");
    }
    const values = new Map(request.entries.map((entry) => [entry.key, `[de] ${entry.value}`]));
    const integrity = new Map(request.entries.map((entry) => [entry.key, ENTRY_STATUS]));
    return { values, integrity, usage: { inputTokens: 40, outputTokens: 12 } };
  },
};

const inertWatcher: CreateWatcher = () => ({
  onChange: () => {},
  close: async () => {},
});

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

const stubbedDeps: Partial<CliDeps> = {
  ...realDeps,
  translate: (input) => translate(input, { createProvider: () => stubProvider }),
  watch: (input) =>
    watch(input, { createWatcher: inertWatcher, createProvider: () => stubProvider }),
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
      targetLocales: ["de", "fr", "es"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: "m", maxTokens: 256 } },
      extract: { framework: "i18next", roots: ["src"] },
      maxTokens: 100000,
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

const LIVE_COMMANDS: readonly (readonly string[])[] = [["translate"], ["watch"]];

describe("every --json document a command prints validates against its published schema", () => {
  let parent: string;
  const ran: Ran[] = [];

  async function runJson(argv: readonly string[], deps: Partial<CliDeps>): Promise<void> {
    const cap = captureStreams();
    const code = await run([...argv, "--json"], recordingDeps(deps).deps, cap.streams, {
      onWatchSession: (session: Session) => session.requestStop(),
    });
    ran.push({ argv, code, out: cap.out(), err: cap.err() });
  }

  beforeAll(async () => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-json-schemas-")));
    const project = join(parent, "project");
    writeProject(project);
    const location = ["--cwd", project, "--config", "project.config.json"];
    for (const argv of PROJECT_COMMANDS) {
      await runJson([...argv, ...location], realDeps);
    }
    for (const argv of LIVE_COMMANDS) {
      const live = join(parent, `live-${argv[0]}`);
      writeProject(live);
      mkdirSync(join(live, "locales", "es.json"));
      await runJson([...argv, "--cwd", live, "--config", "project.config.json"], stubbedDeps);
    }
    await runJson(["check", "--cwd", project, "--config", "missing.config.json"], realDeps);
    const fresh = join(parent, "fresh");
    mkdirSync(join(fresh, "locales"), { recursive: true });
    writeFileSync(join(fresh, "locales", "en.json"), JSON.stringify({ greeting: "Hello" }));
    await runJson(
      [
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
      ],
      realDeps,
    );
  }, 60_000);

  afterAll(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  function envelopesOf(entry: Ran): readonly { ok: boolean; command: string }[] {
    return entry.out
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { ok: boolean; command: string });
  }

  it("gets a success envelope from every fixture command, so each command's own schema is used", () => {
    const failures = ran
      .filter((entry) => !entry.argv.includes("missing.config.json"))
      .filter((entry) => envelopesOf(entry).some((envelope) => envelope.ok !== true))
      .map((entry) => `${entry.argv.join(" ")}: ${entry.out}`);

    expect(failures).toEqual([]);
  });

  it("ran every command it set out to, each printing exactly one document", () => {
    expect(ran.map((entry) => entry.argv[0])).toEqual([
      ...PROJECT_COMMANDS.map((argv) => argv[0]),
      ...LIVE_COMMANDS.map((argv) => argv[0]),
      "check",
      "init",
    ]);
    for (const entry of ran) {
      expect(entry.out.trim().split("\n"), entry.argv.join(" ")).toHaveLength(1);
    }
  });

  it("exercises the live run's usage, budget and failed-locale shapes", () => {
    for (const command of ["translate", "watch"]) {
      const entry = ran.find(
        (candidate) =>
          candidate.argv[0] === command &&
          !candidate.argv.includes("--dry-run") &&
          !candidate.argv.includes("--estimate"),
      );
      const [envelope] = envelopesOf(entry as Ran) as unknown as {
        result: {
          usage?: unknown;
          budget?: unknown;
          failed: string[];
          locales: { error?: unknown }[];
        };
      }[];

      expect(envelope?.result.usage, command).toEqual({ inputTokens: 40, outputTokens: 12 });
      expect(envelope?.result.budget, command).toMatchObject({ maxTokens: 100000 });
      expect(envelope?.result.failed, command).toEqual(["fr", "es"]);
      expect(envelope?.result.locales, command).toContainEqual(
        expect.objectContaining({ locale: "es", error: expect.anything() }),
      );
    }
  });

  it("validates each stdout document against the envelope schema and its command's own, open and closed", () => {
    for (const entry of ran) {
      for (const envelope of envelopesOf(entry)) {
        const label = `${entry.argv.join(" ")} (exit ${entry.code})`;
        const own = envelope.ok ? `${envelope.command}-envelope` : "error-envelope";

        expect(validateBoth("envelope", envelope), label).toEqual(["valid", "valid"]);
        expect(validateBoth(own, envelope), label).toEqual(["valid", "valid"]);
      }
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
      expect(validateBoth("stderr-record", record), JSON.stringify(record)).toEqual([
        "valid",
        "valid",
      ]);
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
      expect(validateBoth("stderr-record", JSON.parse(record)), record).toEqual(["valid", "valid"]);
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
    expect(emitted["diff-envelope"]?.properties).toMatchObject({
      command: { const: "diff" },
      result: { $ref: jsonSchemaUrl("diff-summary") },
    });
    expect(emitted["init-envelope"]?.properties).toMatchObject({
      result: { $ref: jsonSchemaUrl("init-result") },
    });
  });
});
