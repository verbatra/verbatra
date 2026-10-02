import { keyContext } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const keyContextHandler: RpcHandler<"key.context"> = async (params, deps) =>
  keyContext(
    {
      loaded: deps.config,
      cwd: deps.projectRoot,
      locale: params.locale,
      key: params.key,
      ...(params.draft !== undefined ? { draft: params.draft } : {}),
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
    },
  );
