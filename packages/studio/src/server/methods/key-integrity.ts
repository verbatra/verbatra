import { keyIntegrity } from "@verbatra/sdk";
import type { KeyIntegrityLocaleResult } from "../../shared/rpc/key-integrity.js";
import type { RpcHandler } from "../rpc.js";

export const keyIntegrityHandler: RpcHandler<"key.integrity"> = async (params, deps) => {
  const results = await keyIntegrity({
    config: deps.config.config,
    cwd: deps.projectRoot,
    keys: [params.key],
    ...(params.locales !== undefined ? { locales: params.locales } : {}),
  });

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
      markupMatches: entry.markupMatches,
      markupDetails: entry.markupDetails,
    });
  }
  return { locales };
};
