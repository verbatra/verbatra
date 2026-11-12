import { runStatus } from "@verbatra/sdk";
import type { IncompleteRun } from "../../shared/rpc/usage-summary.js";
import type { RpcHandler } from "../rpc.js";

function incompleteRun(locales: readonly { readonly status: string }[]): IncompleteRun | undefined {
  const failed = locales.filter((locale) => locale.status === "failed").length;
  const partial = locales.filter((locale) => locale.status === "partial").length;
  return failed + partial === 0 ? undefined : { failed, partial };
}

export const usageSummaryHandler: RpcHandler<"usage.summary"> = async (_params, deps) => {
  const result = await runStatus({ cwd: deps.projectRoot });
  if (!result.available) {
    return { available: false };
  }
  const incomplete = incompleteRun(result.locales);
  return {
    available: true,
    generatedAt: result.generatedAt,
    ...(result.usage !== undefined ? { usage: result.usage } : {}),
    ...(result.budget !== undefined ? { budget: result.budget } : {}),
    ...(incomplete !== undefined ? { incomplete } : {}),
  };
};
