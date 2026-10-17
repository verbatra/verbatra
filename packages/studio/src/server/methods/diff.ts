import { diff } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { projectReadDeps } from "./project-read-deps.js";

export const statusDiffHandler: RpcHandler<"status.diff"> = async (params, deps) =>
  diff(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    projectReadDeps(deps),
  );
