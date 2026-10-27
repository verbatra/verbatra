import { approveLocale } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { STUDIO_BATCH_LOCK_TIMEOUT_MS } from "./review-batch.js";

export const reviewApproveLocaleHandler: RpcHandler<"review.approveLocale"> = async (
  params,
  deps,
) =>
  approveLocale(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      locale: params.locale,
      ...(params.origins !== undefined ? { origins: params.origins } : {}),
      lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS,
    },
    {
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
    },
  );
