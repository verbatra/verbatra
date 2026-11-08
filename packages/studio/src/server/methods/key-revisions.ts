import { keyHistory } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const keyRevisionsHandler: RpcHandler<"history.keyRevisions"> = async (params, deps) =>
  keyHistory(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      locale: params.locale,
      key: params.key,
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    },
    deps.execFileImpl !== undefined ? { execFile: deps.execFileImpl } : {},
  );
