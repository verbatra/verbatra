import { keyValue } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { projectReadDeps } from "./project-read-deps.js";

export const keyValueHandler: RpcHandler<"key.value"> = async (params, deps) =>
  keyValue(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      locale: params.locale,
      key: params.key,
    },
    projectReadDeps(deps),
  );
