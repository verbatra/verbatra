import { lockState } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { projectReadDeps } from "./project-read-deps.js";

export const lockStateHandler: RpcHandler<"lock.state"> = async (_params, deps) =>
  lockState({ config: deps.config.config, cwd: deps.projectRoot }, projectReadDeps(deps));
