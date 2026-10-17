import { editEntry } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { STUDIO_BATCH_LOCK_TIMEOUT_MS } from "./review-batch.js";

export const editEntryHandler: RpcHandler<"translation.editEntry"> = async (params, deps) =>
  editEntry(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      locale: params.locale,
      key: params.key,
      value: params.value,
      ...(params.actor !== undefined ? { actor: params.actor } : {}),
      lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS,
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
    },
  );
