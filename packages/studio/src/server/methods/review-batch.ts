import { approveEntries, rejectEntries, retranslateEntries } from "@verbatra/sdk";
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";

function reviewDeps(deps: RpcHandlerDeps) {
  return {
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
  };
}

export const reviewApproveManyHandler: RpcHandler<"review.approveMany"> = async (params, deps) =>
  approveEntries(
    { config: deps.config.config, cwd: deps.projectRoot, entries: params.entries },
    reviewDeps(deps),
  );

export const reviewRejectManyHandler: RpcHandler<"review.rejectMany"> = async (params, deps) =>
  rejectEntries(
    { config: deps.config.config, cwd: deps.projectRoot, entries: params.entries },
    reviewDeps(deps),
  );

export const retranslateEntriesHandler: RpcHandler<"translation.retranslateEntries"> = async (
  params,
  deps,
) =>
  retranslateEntries(
    { config: deps.config.config, cwd: deps.projectRoot, entries: params.entries },
    {
      ...reviewDeps(deps),
      ...(deps.createProvider !== undefined ? { createProvider: deps.createProvider } : {}),
    },
  );
