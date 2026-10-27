import { check } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { projectReadDeps } from "./project-read-deps.js";

export const statusCheckHandler: RpcHandler<"status.check"> = async (params, deps) =>
  check(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    projectReadDeps(deps),
  );
