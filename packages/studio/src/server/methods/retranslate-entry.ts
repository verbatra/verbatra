import { retranslateEntry } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { STUDIO_BATCH_LOCK_TIMEOUT_MS } from "./review-batch.js";

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
      lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS,
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
      ...(deps.createProvider !== undefined ? { createProvider: deps.createProvider } : {}),
    },
  );
