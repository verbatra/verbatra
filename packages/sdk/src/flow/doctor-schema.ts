import { z } from "zod";
import type { MachineProviderId } from "../config/provider-config.js";
import { dataFlowManifestSchema } from "./data-flow-manifest.js";
import type { DoctorCheckId } from "./doctor.js";
import { scanDiagnosticSchema } from "./extract-schema.js";
import type { LocaleCapabilityWarningCode } from "./locale-capabilities.js";

const DOCTOR_CHECK_IDS = [
  "config",
  "format-adapter",
  "provider",
  "api-key",
  "network-policy",
  "source-file",
  "plural-rules",
  "plural-completeness",
  "locale-codes",
  "locale-state",
  "locales",
  "untranslated-literals",
  "data-flow",
] as const satisfies readonly DoctorCheckId[];

const MACHINE_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "gemini",
  "deepl",
  "google-translate",
  "openai-compatible",
  "libretranslate",
] as const satisfies readonly MachineProviderId[];

const LOCALE_CAPABILITY_WARNING_CODES = [
  "LOCALE_UNVERIFIED_BY_PROVIDER",
  "LOCALE_NOT_WELL_TESTED",
  "GLOSSARY_UNSUPPORTED_BY_PROVIDER",
  "FORMALITY_UNSUPPORTED_BY_PROVIDER",
] as const satisfies readonly LocaleCapabilityWarningCode[];

const literalFinding = {
  file: z.string(),
  line: z.number(),
  column: z.number(),
  text: z.string(),
  truncated: z.boolean(),
};

const localeCapability = {
  locale: z.string(),
  providerCode: z.string(),
  mapped: z.boolean(),
  support: z.enum(["supported", "unverified", "unsupported"]),
  warnings: z
    .array(z.object({ code: z.enum(LOCALE_CAPABILITY_WARNING_CODES), message: z.string() }))
    .readonly(),
};

const localeCapabilityReportSchema = z.object({
  provider: z.enum(MACHINE_PROVIDER_IDS),
  coverage: z.enum(["listed", "open"]),
  tableVersion: z.string(),
  tableOrigin: z.enum(["static", "live"]),
  live: z
    .object({ status: z.enum(["refreshed", "skipped", "failed"]), detail: z.string() })
    .exactOptional(),
  source: z.object(localeCapability),
  locales: z
    .array(z.object({ ...localeCapability, glossary: z.boolean(), formality: z.boolean() }))
    .readonly(),
});

/**
 * The zod schema for a {@link DoctorResult}, the `result` of `verbatra doctor --json`, including
 * the `--literals`, `--locales`, `--live` and `--data-flow` variants. It allows fields it does not
 * list.
 */
export const doctorResultSchema = z.object({
  ok: z.boolean(),
  checks: z
    .array(
      z.object({
        id: z.enum(DOCTOR_CHECK_IDS),
        title: z.string(),
        status: z.enum(["pass", "warn", "fail", "skipped"]),
        detail: z.string(),
        fix: z.string().exactOptional(),
      }),
    )
    .readonly(),
  literals: z
    .object({
      scannedFiles: z.number(),
      findings: z.array(z.object(literalFinding)).readonly(),
      suppressed: z
        .array(z.object({ ...literalFinding, reason: z.enum(["directive", "ignore-list"]) }))
        .readonly(),
      diagnostics: z.array(scanDiagnosticSchema).readonly(),
    })
    .exactOptional(),
  locales: localeCapabilityReportSchema.exactOptional(),
  dataFlow: dataFlowManifestSchema.exactOptional(),
});
