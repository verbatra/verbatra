import {
  type GlossaryProvenance,
  type ProviderId,
  redact,
  type SupportedFormat,
} from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { resolveConfigSource, resolveGlossaryProvenance } from "./config-projection.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

interface ProjectSnapshotResult {
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly format: SupportedFormat;
  readonly files: { readonly pattern: string };
  readonly provider: { readonly id: ProviderId };
  readonly configSource: string;
  readonly glossary: GlossaryProvenance;
}

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
    "Read the resolved verbatra project configuration: source locale, target locales, file " +
    "format, the locale-file path pattern, the configured translation provider id, where the " +
    "config file was loaded from, and whether a glossary is configured. Call this first to " +
    "orient before calling any other tool, since it tells you which locales and provider are in " +
    "play without reading any locale file content. Read-only, calls no provider.",
  paramsSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: projectSnapshot,
});
