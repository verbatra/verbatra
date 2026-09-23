import { translate } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const estimateHandler: RpcHandler<"translation.estimate"> = async (params, deps) =>
  translate(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      estimate: true,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
    },
  );
