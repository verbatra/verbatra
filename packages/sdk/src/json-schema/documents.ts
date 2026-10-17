import { z } from "zod";
import { verbatraConfigSchema } from "../config/schema.js";
import { checkFileSummarySchema } from "../flow/check-file-schema.js";
import { checkSummarySchema } from "../flow/check-schema.js";
import { dataFlowManifestSchema } from "../flow/data-flow-manifest.js";
import { diffSummarySchema } from "../flow/diff-schema.js";
import { doctorResultSchema } from "../flow/doctor-schema.js";
import { extractResultSchema } from "../flow/extract-schema.js";
import { generateTypesResultSchema } from "../flow/generate-types-schema.js";
import { provenanceReportResultSchema } from "../flow/provenance-report-schema.js";
import { pseudolocalizeResultSchema } from "../flow/pseudo-schema.js";
import { runSummarySchema } from "../flow/summary-schema.js";
import { exportTmxResultSchema } from "../flow/tmx/export-tmx-schema.js";
import { importTmxResultSchema } from "../flow/tmx/import-tmx-schema.js";
import { exportWorkbookResultSchema } from "../flow/workbook/export-workbook-schema.js";
import { lockWaitEventSchema } from "../lock/lock-wait-schema.js";
import { progressEventSchema } from "../progress/progress-schema.js";

/**
 * Where verbatra serves its JSON Schemas. `v1` tracks envelope `version: 1` and always serves the
 * latest release: additive changes stay in `v1`, a breaking payload change adds `v2`.
 */
export const JSON_SCHEMA_BASE_URL = "https://verbatra.kreitz-webdev.de/schema/v1/";

export const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/** One JSON Schema document verbatra publishes, and the zod schema it is generated from. */
export interface JsonSchemaDocument {
  /** The file name without `.json`, also the last segment of its URL. */
  readonly name: string;
  /** The document's `title`. */
  readonly title: string;
  /** The zod schema the document is generated from. */
  readonly schema: z.ZodType;
  /** `input` for a document describing what verbatra reads (the config); `output` otherwise. */
  readonly io: "input" | "output";
}

/** A generated JSON Schema document, as written to `dist/schemas/<name>.json`. */
export type JsonSchemaObject = Readonly<Record<string, unknown>>;

/**
 * Every JSON Schema `@verbatra/sdk` ships under `dist/schemas/`: the config and one per result,
 * stderr record and data-flow manifest the CLI prints under `--json`.
 */
export const SDK_JSON_SCHEMAS: readonly JsonSchemaDocument[] = [
  { name: "config", title: "verbatra config", schema: verbatraConfigSchema, io: "input" },
  { name: "run-summary", title: "verbatra run summary", schema: runSummarySchema, io: "output" },
  {
    name: "check-summary",
    title: "verbatra check summary",
    schema: checkSummarySchema,
    io: "output",
  },
  {
    name: "check-file-summary",
    title: "verbatra check --file summary",
    schema: checkFileSummarySchema,
    io: "output",
  },
  { name: "diff-summary", title: "verbatra diff summary", schema: diffSummarySchema, io: "output" },
  {
    name: "doctor-result",
    title: "verbatra doctor result",
    schema: doctorResultSchema,
    io: "output",
  },
  {
    name: "data-flow-manifest",
    title: "verbatra data-flow manifest",
    schema: dataFlowManifestSchema,
    io: "output",
  },
  {
    name: "provenance-report",
    title: "verbatra provenance report",
    schema: provenanceReportResultSchema,
    io: "output",
  },
  {
    name: "pseudolocalize-result",
    title: "verbatra pseudo result",
    schema: pseudolocalizeResultSchema,
    io: "output",
  },
  {
    name: "generate-types-result",
    title: "verbatra types result",
    schema: generateTypesResultSchema,
    io: "output",
  },
  {
    name: "extract-result",
    title: "verbatra extract result",
    schema: extractResultSchema,
    io: "output",
  },
  {
    name: "export-workbook-result",
    title: "verbatra export result",
    schema: exportWorkbookResultSchema,
    io: "output",
  },
  {
    name: "import-tmx-result",
    title: "verbatra tmx import result",
    schema: importTmxResultSchema,
    io: "output",
  },
  {
    name: "export-tmx-result",
    title: "verbatra tmx export result",
    schema: exportTmxResultSchema,
    io: "output",
  },
  {
    name: "progress-event",
    title: "verbatra progress event",
    schema: progressEventSchema,
    io: "output",
  },
  {
    name: "lock-wait-event",
    title: "verbatra lock-wait event",
    schema: lockWaitEventSchema,
    io: "output",
  },
];

/**
 * The public URL, and the `$id`, of verbatra's published document named `name`, under
 * {@link JSON_SCHEMA_BASE_URL}. It does not check that such a document exists.
 */
export function jsonSchemaUrl(name: string): string {
  return `${JSON_SCHEMA_BASE_URL}${name}.json`;
}

type JsonNode = Record<string, unknown>;

const NEVER_PRESENT: JsonNode = { not: {} };

const NEVER_PRESENT_TEXT = JSON.stringify(NEVER_PRESENT);

function isNeverPresent(node: unknown): boolean {
  return JSON.stringify(node) === NEVER_PRESENT_TEXT;
}

function dropRequiredUndefinedKeys(zodSchema: z.core.$ZodType, jsonSchema: JsonNode): void {
  if (!(zodSchema instanceof z.ZodObject) || !Array.isArray(jsonSchema.required)) {
    return;
  }
  const shape: Record<string, z.ZodType> = zodSchema.shape;
  const undefinable = new Set(
    Object.entries(shape)
      .filter(([, field]) => field.safeParse(undefined).success)
      .map(([key]) => key),
  );
  const required = jsonSchema.required.filter((key: string) => !undefinable.has(key));
  if (required.length === 0) {
    delete jsonSchema.required;
  } else {
    jsonSchema.required = required;
  }
}

function openAndClean(context: { zodSchema: z.core.$ZodType; jsonSchema: JsonNode }): void {
  const { zodSchema, jsonSchema } = context;
  if (jsonSchema.additionalProperties === false) {
    delete jsonSchema.additionalProperties;
  }
  delete jsonSchema.readOnly;
  if (zodSchema instanceof z.ZodUndefined) {
    for (const key of Object.keys(jsonSchema)) {
      delete jsonSchema[key];
    }
    Object.assign(jsonSchema, NEVER_PRESENT);
  }
  dropRequiredUndefinedKeys(zodSchema, jsonSchema);
}

function stripNeverPresent(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripNeverPresent);
  }
  if (typeof node !== "object" || node === null) {
    return node;
  }
  const entries = Object.entries(node)
    .filter(([key, value]) => key === "not" || !isNeverPresent(value))
    .map(([key, value]) => [key, stripNeverPresent(value)]);
  const stripped: JsonNode = Object.fromEntries(entries);
  if (!Array.isArray(stripped.anyOf)) {
    return stripped;
  }
  const branches = stripped.anyOf.filter((branch) => !isNeverPresent(branch));
  const { anyOf: _anyOf, ...rest } = stripped;
  return branches.length === 1
    ? { ...rest, ...(branches[0] as JsonNode) }
    : { ...rest, anyOf: branches };
}

/**
 * Generate the JSON Schema (draft 2020-12) of one zod schema the way verbatra publishes its output
 * documents: every object allows properties it does not list, a field that can be `undefined` is
 * not required, and a field a variant never carries is left out. It sets no `$id`, so it suits a
 * schema embedded in another document, such as an MCP tool's `outputSchema`.
 */
export function renderOutputJsonSchema(schema: z.ZodType): JsonSchemaObject {
  return stripNeverPresent(
    z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "output",
      unrepresentable: "any",
      override: openAndClean,
    }),
  ) as JsonSchemaObject;
}

function renderGroup(
  documents: readonly JsonSchemaDocument[],
  references: readonly JsonSchemaDocument[],
  io: "input" | "output",
): Record<string, JsonSchemaObject> {
  const registry = z.registry<{ id: string }>();
  for (const document of [...references, ...documents]) {
    if (document.io === io && !registry.has(document.schema)) {
      registry.add(document.schema, { id: document.name });
    }
  }
  const { schemas } = z.toJSONSchema(registry, {
    target: "draft-2020-12",
    io,
    unrepresentable: "any",
    uri: jsonSchemaUrl,
    ...(io === "output" ? { override: openAndClean } : {}),
  });
  const rendered: Record<string, JsonSchemaObject> = {};
  for (const document of documents.filter((candidate) => candidate.io === io)) {
    const generated = stripNeverPresent(schemas[document.name]) as JsonNode;
    const { $schema: _dialect, $id: _id, ...body } = generated;
    rendered[document.name] = {
      $schema: JSON_SCHEMA_DIALECT,
      $id: jsonSchemaUrl(document.name),
      title: document.title,
      ...body,
    };
  }
  return rendered;
}

/**
 * Generate verbatra's own JSON Schema documents for `documents`, keyed by name. Each document is
 * stamped with the `$id` {@link jsonSchemaUrl} gives its name, a URL on verbatra's documentation
 * site, so it is meant for verbatra's documents ({@link SDK_JSON_SCHEMAS} and the CLI's), not for
 * schemas of your own; use {@link renderOutputJsonSchema} for those. Every object of an `output`
 * document allows properties it does not list, since verbatra's JSON output only ever grows; an
 * `input` document keeps the closed objects its zod schema declares. A document that embeds
 * another one from `documents` or `references` points at it by its `$id`.
 */
export function renderJsonSchemas(
  documents: readonly JsonSchemaDocument[],
  references: readonly JsonSchemaDocument[] = [],
): Readonly<Record<string, JsonSchemaObject>> {
  return {
    ...renderGroup(documents, references, "input"),
    ...renderGroup(documents, references, "output"),
  };
}
