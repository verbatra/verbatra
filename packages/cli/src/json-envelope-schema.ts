import {
  checkFileSummarySchema,
  checkSummarySchema,
  diffSummarySchema,
  doctorResultSchema,
  exportTmxResultSchema,
  exportWorkbookResultSchema,
  extractResultSchema,
  generateTypesResultSchema,
  importTmxResultSchema,
  type JsonSchemaDocument,
  lockWaitEventSchema,
  progressEventSchema,
  provenanceReportResultSchema,
  pseudolocalizeResultSchema,
  runSummarySchema,
} from "@verbatra/sdk";
import { z } from "zod";
import { initResultSchema } from "./init-schema.js";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";

const version = z.literal(JSON_ENVELOPE_VERSION);
const stringList = z.array(z.string()).readonly();

export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  version,
  command: z.string().nullable(),
  code: z.string(),
  message: z.string(),
  causeCode: z.string().exactOptional(),
  candidates: stringList.exactOptional(),
  missing: stringList.exactOptional(),
  hint: z.string().exactOptional(),
});

export function successEnvelopeSchema<const Command extends string, Result extends z.ZodType>(
  command: Command,
  result: Result,
) {
  return z.object({ ok: z.literal(true), version, command: z.literal(command), result });
}

export const COMMAND_RESULT_SCHEMAS = {
  translate: runSummarySchema,
  watch: runSummarySchema,
  import: runSummarySchema,
  export: exportWorkbookResultSchema,
  tmx: z.union([importTmxResultSchema, exportTmxResultSchema]),
  check: z.union([checkSummarySchema, checkFileSummarySchema]),
  diff: diffSummarySchema,
  report: provenanceReportResultSchema,
  pseudo: pseudolocalizeResultSchema,
  types: generateTypesResultSchema,
  doctor: doctorResultSchema,
  extract: extractResultSchema,
  init: initResultSchema,
} as const;

const commandEnvelopes = Object.entries(COMMAND_RESULT_SCHEMAS).map(([command, result]) => ({
  command,
  schema: successEnvelopeSchema(command, result),
}));

export const interruptedRecordSchema = z.union([
  z.object({
    type: z.literal("interrupted"),
    signal: z.enum(["SIGINT", "SIGTERM"]),
    locksReleased: z.literal(true),
  }),
  z.object({
    type: z.literal("interrupted"),
    signal: z.enum(["SIGINT", "SIGTERM"]),
    locksReleased: z.literal(false),
    reason: z.literal("failed"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("interrupted"),
    signal: z.enum(["SIGINT", "SIGTERM"]),
    locksReleased: z.literal(false),
    reason: z.literal("timed-out"),
    deadlineMs: z.number(),
  }),
]);

const lockWaitRecordSchema = lockWaitEventSchema.extend({ type: z.literal("lock-wait") });

const stderrRecordSchema = z.union([
  progressEventSchema,
  lockWaitRecordSchema,
  interruptedRecordSchema,
]);

const envelopeSchema = z.union([
  ...commandEnvelopes.map(({ schema }) => schema),
  errorEnvelopeSchema,
]);

export const CLI_JSON_SCHEMAS: readonly JsonSchemaDocument[] = [
  { name: "envelope", title: "verbatra --json envelope", schema: envelopeSchema, io: "output" },
  {
    name: "error-envelope",
    title: "verbatra --json error envelope",
    schema: errorEnvelopeSchema,
    io: "output",
  },
  ...commandEnvelopes.map(({ command, schema }) => ({
    name: `${command}-envelope`,
    title: `verbatra ${command} --json envelope`,
    schema,
    io: "output" as const,
  })),
  { name: "init-result", title: "verbatra init result", schema: initResultSchema, io: "output" },
  {
    name: "stderr-record",
    title: "verbatra --json stderr record",
    schema: stderrRecordSchema,
    io: "output",
  },
];
