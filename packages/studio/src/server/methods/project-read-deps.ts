import type { CheckDeps, SdkFs } from "@verbatra/sdk";
import type { RpcHandlerDeps } from "../rpc.js";

export interface ProjectReadDeps {
  readonly fs?: SdkFs;
  readonly adapterRegistry?: NonNullable<CheckDeps["adapterRegistry"]>;
}

export function projectReadDeps(deps: RpcHandlerDeps): ProjectReadDeps {
  return {
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
  };
}
