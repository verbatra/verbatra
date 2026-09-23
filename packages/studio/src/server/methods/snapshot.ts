import { resolveCapabilities } from "../capabilities.js";
import { buildProjectSnapshot } from "../projection.js";
import type { RpcHandler } from "../rpc.js";

export const snapshotHandler: RpcHandler<"project.snapshot"> = async (_params, deps) =>
  buildProjectSnapshot(
    deps.config,
    deps.projectRoot,
    resolveCapabilities(deps.spend ?? false, deps.config.config),
    deps.exposeAgentTools ?? false,
  );
