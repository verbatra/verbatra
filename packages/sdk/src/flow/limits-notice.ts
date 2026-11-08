import { LIMITS_FILE_NAME, type LimitsUnusable } from "../config/limits-file.js";
import type { LocaleSummary, SdkNotice } from "./summary.js";

export function limitsIgnoredNotice(unusable: LimitsUnusable): SdkNotice {
  return {
    code: "LIMITS_FILE_IGNORED",
    message:
      `${unusable.message}, so it was ignored: values are held to the config's maxLength budgets ` +
      `only. Fix or delete ${LIMITS_FILE_NAME}; it was left as it is.`,
  };
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
