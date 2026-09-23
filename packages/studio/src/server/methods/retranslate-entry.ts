import { retranslateEntry } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const retranslateEntryHandler: RpcHandler<"translation.retranslateEntry"> = async (
  params,
  deps,
) =>
  retranslateEntry(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      locale: params.locale,
      key: params.key,
      ...(params.includeHuman === true ? { includeHuman: true } : {}),
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
      ...(deps.createProvider !== undefined ? { createProvider: deps.createProvider } : {}),
    },
  );
