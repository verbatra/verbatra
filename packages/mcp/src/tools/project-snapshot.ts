import { redact } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import {
  glossaryProvenanceSchema,
  resolveConfigSource,
  resolveGlossaryProvenance,
} from "./config-projection.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

const projectSnapshotResultSchema = z.strictObject({
  sourceLocale: z.string(),
  targetLocales: z.array(z.string()).readonly(),
  format: z.string(),
  files: z.strictObject({ pattern: z.string() }),
  provider: z.strictObject({ id: z.string() }),
  configSource: z.string(),
  glossary: glossaryProvenanceSchema,
});

type ProjectSnapshotResult = z.infer<typeof projectSnapshotResultSchema>;

async function projectSnapshot(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<ProjectSnapshotResult> {
  const { config } = context.config;
  return {
    sourceLocale: redact(config.sourceLocale),
    targetLocales: config.targetLocales.map((locale) => redact(locale)),
    format: config.format,
    files: { pattern: redact(config.files.pattern) },
    provider: { id: config.provider.id },
    configSource: resolveConfigSource(context.config.source, context.cwd),
    glossary: resolveGlossaryProvenance(context.config.glossary, context.cwd),
  };
}

export const projectSnapshotTool = defineTool({
  name: "project.snapshot",
  description:
    "Reads the resolved project configuration: source locale, target locales, file format, " +
    "the locale-file path pattern, the configured provider id, where the config was loaded " +
    "from, and where the glossary comes from. Call it first, since every other tool takes " +
    "its locale codes from this project, and a provider id of none means the spend tools " +
    "are never listed. Do not use it to read translated text or translation status: it " +
    "reads no locale file, and it is resolved once when the server starts, so it does not " +
    "change between calls. Takes no parameters. Read-only: it calls no provider and writes " +
    "nothing.",
  paramsSchema,
  outputSchema: projectSnapshotResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: projectSnapshot,
});
