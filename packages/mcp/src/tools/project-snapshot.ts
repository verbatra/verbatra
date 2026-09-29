import { type HumanEditsPolicy, redact, SdkError } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext, McpUnconfiguredContext } from "../types.js";
import {
  glossaryProvenanceSchema,
  resolveConfigSource,
  resolveGlossaryProvenance,
} from "./config-projection.js";
import { defineTool, describeErrorMessage } from "./define-tool.js";

const paramsSchema = z.strictObject({});

const HUMAN_EDITS_POLICIES = [
  "protect",
  "suggest",
  "overwrite",
] as const satisfies readonly HumanEditsPolicy[];

const UNCONFIGURED_NEXT_STEP =
  "Call project.doctor for every failing setup check and its fix. The server loads the config " +
  "on the next call once it is valid, without a restart.";

const projectSnapshotResultSchema = z.object({
  configured: z.boolean(),
  sourceLocale: z.string().optional(),
  targetLocales: z.array(z.string()).readonly().optional(),
  format: z.string().optional(),
  files: z.object({ pattern: z.string() }).optional(),
  provider: z.object({ id: z.string() }).optional(),
  configSource: z.string().optional(),
  glossary: glossaryProvenanceSchema.optional(),
  humanEdits: z.enum(HUMAN_EDITS_POLICIES).optional(),
  prune: z.boolean().optional(),
  configProblem: z.object({ code: z.string(), message: z.string() }).optional(),
  nextStep: z.string().optional(),
});

type ProjectSnapshotResult = z.infer<typeof projectSnapshotResultSchema>;

async function projectSnapshot(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<ProjectSnapshotResult> {
  const { config } = context.config;
  return {
    configured: true,
    sourceLocale: redact(config.sourceLocale),
    targetLocales: config.targetLocales.map((locale) => redact(locale)),
    format: config.format,
    files: { pattern: redact(config.files.pattern) },
    provider: { id: config.provider.id },
    configSource: resolveConfigSource(context.config.source, context.cwd),
    glossary: resolveGlossaryProvenance(context.config.glossary, context.cwd),
    humanEdits: config.humanEdits ?? "protect",
    prune: config.prune ?? false,
  };
}

async function unconfiguredSnapshot(
  _params: z.infer<typeof paramsSchema>,
  context: McpUnconfiguredContext,
): Promise<ProjectSnapshotResult> {
  const error = context.configError;
  return {
    configured: false,
    configProblem: {
      code: error instanceof SdkError ? error.code : "CONFIG_INVALID",
      message: redact(describeErrorMessage(error, context.cwd)),
    },
    nextStep: UNCONFIGURED_NEXT_STEP,
  };
}

export const projectSnapshotTool = defineTool({
  name: "project.snapshot",
  description:
    "Reads the resolved project configuration: whether a usable config is loaded (configured), " +
    "source locale, target locales, file format, " +
    "the locale-file path pattern, the configured provider id, where the config was loaded " +
    "from, where the glossary comes from, the humanEdits policy (protect, suggest, or " +
    "overwrite; protect when unset), and whether a translate run prunes orphaned keys " +
    "(prune, false when unset). Call it first, since every other tool takes its locale " +
    "codes from this project, a provider id of none means the spend tools are never listed, " +
    "humanEdits says whether a person's values are protected from machine writes, and prune " +
    "says whether translation.translatePending deletes orphaned keys. Do not use it to read " +
    "translated text or translation status: it reads no locale file. The server reloads the " +
    "config before a call when the config file or its glossary file changed, so call it again " +
    "after an edit. With configured: false no config was found or it is invalid: only " +
    "configProblem (its error code and message) and nextStep are set, every tool except " +
    "project.snapshot and project.doctor refuses with that error, and project.doctor lists " +
    "what to fix. Takes no parameters. " +
    "Read-only: it calls no provider and writes nothing.",
  paramsSchema,
  outputSchema: projectSnapshotResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: projectSnapshot,
  unconfiguredHandler: unconfiguredSnapshot,
});
