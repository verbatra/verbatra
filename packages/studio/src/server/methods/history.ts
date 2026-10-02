import { localeHistory } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const historyListHandler: RpcHandler<"history.list"> = async (params, deps) =>
  localeHistory(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    },
    deps.execFileImpl !== undefined ? { execFile: deps.execFileImpl } : {},
  );
