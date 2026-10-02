import { localeValues } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const localeValuesHandler: RpcHandler<"locale.values"> = async (_params, deps) =>
  localeValues(
    { config: deps.config.config, cwd: deps.projectRoot },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
    },
  );
