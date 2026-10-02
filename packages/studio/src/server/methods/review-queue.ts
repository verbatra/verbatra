import { reviewQueue } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const reviewQueueHandler: RpcHandler<"review.queue"> = async (params, deps) =>
  reviewQueue(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      ...(params.includeApproved === true ? { includeApproved: true } : {}),
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
    },
  );
