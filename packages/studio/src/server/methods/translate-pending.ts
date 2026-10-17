import { assertMachineTranslationEnabled, translate } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const translatePendingHandler: RpcHandler<"translation.translatePending"> = async (
  params,
  deps,
) => {
  assertMachineTranslationEnabled(deps.config.config, "translating every pending key");
  return translate(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
      ...(params.maxTokens !== undefined ? { maxTokens: params.maxTokens } : {}),
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
      ...(deps.createProvider !== undefined ? { createProvider: deps.createProvider } : {}),
    },
  );
};
