import { keyIntegrity } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const localeIntegrityHandler: RpcHandler<"locale.integrity"> = async (params, deps) => ({
  locales: await keyIntegrity(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
    },
  ),
});
