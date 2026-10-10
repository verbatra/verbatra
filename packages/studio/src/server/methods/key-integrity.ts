import { keyIntegrity } from "@verbatra/sdk";
import type { KeyIntegrityLocaleResult } from "../../shared/rpc/key-integrity.js";
import type { RpcHandler } from "../rpc.js";
import { projectReadDeps } from "./project-read-deps.js";

export const keyIntegrityHandler: RpcHandler<"key.integrity"> = async (params, deps) => {
  const results = await keyIntegrity(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      keys: [params.key],
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    projectReadDeps(deps),
  );

  const locales: KeyIntegrityLocaleResult[] = [];
  for (const locale of results) {
    const entry = locale.entries[0];
    if (entry === undefined) {
      continue;
    }
    locales.push({
      locale: locale.locale,
      hasPlaceholders: entry.hasPlaceholders,
      matches: entry.matches,
      missing: entry.missing,
      extra: entry.extra,
      icuValid: entry.icuValid,
      icuArmsMatch: entry.icuArmsMatch,
      icuArmDetails: entry.icuArmDetails,
      markupMatches: entry.markupMatches,
      markupDetails: entry.markupDetails,
    });
  }
  return { locales };
};
