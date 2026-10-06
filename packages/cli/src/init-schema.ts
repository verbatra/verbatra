import type { DetectedFormatSource, LocaleStyle, SupportedFormat } from "@verbatra/sdk";
import { z } from "zod";
import type { AgentClientId, ClientSelectedBy } from "./agent-clients.js";
import type { ClientServerState, ClientSkipReason } from "./agent-scaffold.js";
import type { FileAction } from "./init.js";
import type { ValueSource } from "./init-answers.js";
import type { FormatOrigin } from "./init-config.js";

const SUPPORTED_FORMATS = [
  "i18next-json",
  "vue-i18n-json",
  "next-intl-json",
  "ngx-translate-json",
  "xliff",
  "yaml",
  "arb",
  "properties",
  "apple-strings",
  "apple-xcstrings",
  "android-xml",
  "gettext-po",
  "ini",
  "resx",
] as const satisfies readonly SupportedFormat[];

const FILE_ACTIONS = [
  "created",
  "overwritten",
  "updated",
  "unchanged",
] as const satisfies readonly FileAction[];

const VALUE_SOURCES = [
  "flag",
  "detected",
  "prompt",
  "default",
] as const satisfies readonly ValueSource[];

const FORMAT_ORIGINS = [
  "files",
  "dependencies",
  "flag",
  "prompt",
  "default",
] as const satisfies readonly FormatOrigin[];

const DETECTED_FORMAT_SOURCES = [
  "input",
  "files",
  "dependencies",
] as const satisfies readonly DetectedFormatSource[];

const LOCALE_STYLES = ["literal", "posix", "android"] as const satisfies readonly LocaleStyle[];

const CLIENT_SERVER_STATES = [
  "added",
  "present",
  "differs",
  "skipped",
] as const satisfies readonly ClientServerState[];

const AGENT_CLIENT_IDS = ["claude", "cursor", "vscode"] as const satisfies readonly AgentClientId[];

const CLIENT_SKIP_REASONS = ["plugin", "symlink"] as const satisfies readonly ClientSkipReason[];

const CLIENT_SELECTED_BY = [
  "flag",
  "markers",
  "default",
] as const satisfies readonly ClientSelectedBy[];

const stringList = z.array(z.string()).readonly();

const detectionSchema = z.object({
  format: z
    .object({
      id: z.union([z.enum(SUPPORTED_FORMATS), z.templateLiteral(["custom:", z.string()])]),
      from: z.enum(DETECTED_FORMAT_SOURCES),
    })
    .nullable(),
  layout: z
    .object({
      pattern: z.string(),
      localeStyle: z.enum(LOCALE_STYLES),
      locales: stringList,
      sourceLocale: z.string().nullable(),
      files: stringList,
      unqualifiedSourceFile: z.string().nullable(),
    })
    .nullable(),
  ambiguities: z
    .array(z.object({ subject: z.enum(["format", "layout"]), candidates: stringList }))
    .readonly(),
  confidence: z.enum(["high", "medium", "low", "none"]),
  reasons: stringList,
});

export const initResultSchema = z.object({
  configPath: z.string(),
  files: z.array(z.object({ path: z.string(), action: z.enum(FILE_ACTIONS) })).readonly(),
  dryRun: z.boolean(),
  config: z.record(z.string(), z.unknown()).nullable(),
  sources: z
    .object({
      provider: z.enum(VALUE_SOURCES),
      format: z.enum(FORMAT_ORIGINS),
      pattern: z.enum(VALUE_SOURCES),
      sourceLocale: z.enum(VALUE_SOURCES),
      targetLocales: z.enum(VALUE_SOURCES),
    })
    .nullable(),
  apiKeyEnvVar: z.string().nullable(),
  detection: detectionSchema.nullable(),
  agent: z
    .object({
      instructionsFile: z.string(),
      mcpServer: z.enum(CLIENT_SERVER_STATES).nullable(),
      configKept: z.boolean(),
      clients: z
        .array(
          z.object({
            id: z.enum(AGENT_CLIENT_IDS),
            file: z.string(),
            server: z.enum(CLIENT_SERVER_STATES),
            reason: z.enum(CLIENT_SKIP_REASONS).nullable(),
            selectedBy: z.enum(CLIENT_SELECTED_BY),
            markers: stringList,
          }),
        )
        .readonly(),
    })
    .nullable(),
  nextSteps: z
    .array(z.object({ description: z.string(), command: z.string().nullable() }))
    .readonly(),
});
