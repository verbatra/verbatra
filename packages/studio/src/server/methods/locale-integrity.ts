import { localeIntegrity } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { projectReadDeps } from "./project-read-deps.js";

export const localeIntegrityHandler: RpcHandler<"locale.integrity"> = async (params, deps) => ({
  locales: await localeIntegrity(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    projectReadDeps(deps),
  ),
});
