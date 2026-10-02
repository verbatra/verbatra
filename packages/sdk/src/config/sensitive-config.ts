import { z } from "zod";

/** The built-in `sensitiveData` detectors, by id. */
export const SENSITIVE_DETECTORS = [
  "secret",
  "email",
  "iban",
  "credit-card",
  "phone",
  "ip",
  "private-host",
] as const;

/** One of {@link SENSITIVE_DETECTORS}. */
export type SensitiveDetectorId = (typeof SENSITIVE_DETECTORS)[number];

export const DEFAULT_SENSITIVE_DETECTORS: readonly SensitiveDetectorId[] = [
  "secret",
  "email",
  "iban",
  "credit-card",
];

export const SENSITIVE_MODES = ["off", "warn", "block", "redact"] as const;

export type SensitiveMode = (typeof SENSITIVE_MODES)[number];

function compilesAsPattern(source: string): boolean {
  try {
    new RegExp(source, "u");
    return true;
  } catch {
    return false;
  }
}

export const sensitiveDataSchema = z.strictObject({
  mode: z.enum(SENSITIVE_MODES),
  detectors: z.array(z.enum(SENSITIVE_DETECTORS)).optional(),
  patterns: z
    .array(
      z.string().min(1).refine(compilesAsPattern, {
        message: "sensitiveData.patterns entries must be valid regular expressions",
      }),
    )
    .optional(),
  allow: z.array(z.string().min(1)).optional(),
});

export type SensitiveDataConfig = z.infer<typeof sensitiveDataSchema>;
