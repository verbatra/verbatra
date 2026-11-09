import { applyValueReplace, previewValueReplace } from "@verbatra/sdk";
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";
import { STUDIO_BATCH_LOCK_TIMEOUT_MS } from "./review-batch.js";

function replaceDeps(deps: RpcHandlerDeps) {
  return {
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
  };
}

export const previewValueReplaceHandler: RpcHandler<"translation.previewValueReplace"> = (
  params,
  deps,
) =>
  previewValueReplace(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      find: params.find,
      replace: params.replace,
      ...(params.caseSensitive !== undefined ? { caseSensitive: params.caseSensitive } : {}),
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    replaceDeps(deps),
  );

export const applyValueReplaceHandler: RpcHandler<"translation.applyValueReplace"> = (
  params,
  deps,
) =>
  applyValueReplace(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      find: params.find,
      replace: params.replace,
      ...(params.caseSensitive !== undefined ? { caseSensitive: params.caseSensitive } : {}),
      entries: params.entries,
      ...(params.includePinned !== undefined ? { includePinned: params.includePinned } : {}),
      ...(params.includeProtected !== undefined
        ? { includeProtected: params.includeProtected }
        : {}),
      actor: "human",
      lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS,
    },
    replaceDeps(deps),
  );
