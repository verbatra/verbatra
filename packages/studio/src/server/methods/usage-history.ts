import { runHistory } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const usageHistoryHandler: RpcHandler<"usage.history"> = async (params, deps) =>
  runHistory(
    {
      cwd: deps.projectRoot,
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    },
    deps.fs !== undefined ? { fs: deps.fs } : {},
  );
