import { type LimitsUnusable, limitsRemedy } from "../config/limits-file.js";
import type { LocaleSummary } from "./summary.js";

/**
 * Why a result holds values to the config's `maxLength` budgets alone although
 * `verbatra.limits.json` exists. Returned as `limitsNotice` by every call that reads the limits
 * file when the file cannot be used; the file is left as it is.
 */
export interface LimitsFileNotice {
  /** Always `LIMITS_FILE_IGNORED`. */
  readonly code: "LIMITS_FILE_IGNORED";
  /** What is wrong with the file, never a path or a value. */
  readonly message: string;
}

export function limitsIgnoredNotice(unusable: LimitsUnusable): LimitsFileNotice {
  return {
    code: "LIMITS_FILE_IGNORED",
    message:
      `${unusable.message}, so it was ignored: values are held to the config's maxLength budgets ` +
      `only. ${limitsRemedy(unusable)}; it was left as it is.`,
  };
}

export function limitsNoticeField(unusable: LimitsUnusable | undefined): {
  readonly limitsNotice?: LimitsFileNotice;
} {
  return unusable === undefined ? {} : { limitsNotice: limitsIgnoredNotice(unusable) };
}

export function withLimitsNotice(
  summaries: readonly LocaleSummary[],
  unusable: LimitsUnusable | undefined,
): LocaleSummary[] {
  if (unusable === undefined) {
    return [...summaries];
  }
  const notice = limitsIgnoredNotice(unusable);
  return summaries.map((summary) => ({ ...summary, notices: [...summary.notices, notice] }));
}
