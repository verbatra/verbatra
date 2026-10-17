import { z } from "zod";
import {
  MAX_PATHS,
  MAX_PATHS_WITH_UNBOUNDED,
  type UnsafePatternReason,
  unsafePatternReason,
} from "../sensitive/pattern-safety.js";

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

/** One built-in `sensitiveData` detector id. */
export type SensitiveDetectorId = (typeof SENSITIVE_DETECTORS)[number];

export const DEFAULT_SENSITIVE_DETECTORS: readonly SensitiveDetectorId[] = [
  "secret",
  "email",
  "iban",
  "credit-card",
];

export const SENSITIVE_MODES = ["off", "warn", "block", "redact"] as const;

function compilesAsPattern(source: string): boolean {
  try {
    new RegExp(source, "u");
    return true;
  } catch {
    return false;
  }
}

const UNSAFE_PATTERN_MESSAGES: Readonly<Record<UnsafePatternReason, string>> = {
  "nested-repeat":
    "sensitiveData.patterns entries must not repeat more than once a group that holds a quantifier or an alternative, such as (a+)+, (a|aa)* or (?:a?){30}",
  "several-unbounded":
    "sensitiveData.patterns entries may hold at most one unbounded repeat (*, + or {n,}, lazy forms included); use a bounded {m,n} for the others",
  "too-many-paths": `sensitiveData.patterns entries may branch at most ${MAX_PATHS_WITH_UNBOUNDED} ways beside an unbounded repeat, or ${MAX_PATHS} ways without one, counting ?, {m,n} and | alternatives together`,
};

function checkPattern(source: string, context: z.RefinementCtx): void {
  if (!compilesAsPattern(source)) {
    context.addIssue({
      code: "custom",
      message: "sensitiveData.patterns entries must be valid regular expressions",
    });
    return;
  }
  const reason = unsafePatternReason(source);
  if (reason !== undefined) {
    context.addIssue({ code: "custom", message: UNSAFE_PATTERN_MESSAGES[reason] });
  }
}

export const sensitiveDataSchema = z.strictObject({
  mode: z.enum(SENSITIVE_MODES),
  detectors: z.array(z.enum(SENSITIVE_DETECTORS)).optional(),
  patterns: z.array(z.string().min(1).superRefine(checkPattern)).optional(),
  allow: z.array(z.string().min(1)).optional(),
});

export type SensitiveDataConfig = z.infer<typeof sensitiveDataSchema>;
