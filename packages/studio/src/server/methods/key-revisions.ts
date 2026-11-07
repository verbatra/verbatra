import { keyHistory, redact } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const keyRevisionsHandler: RpcHandler<"history.keyRevisions"> = async (params, deps) => {
  const result = await keyHistory(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      locale: params.locale,
      key: params.key,
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    },
    deps.execFileImpl !== undefined ? { execFile: deps.execFileImpl } : {},
  );
  if (!result.available) {
    return result;
  }
  return {
    ...result,
    revisions: result.revisions.map((revision) => ({
      ...revision,
      author: redact(revision.author),
      subject: redact(revision.subject),
    })),
  };
};
