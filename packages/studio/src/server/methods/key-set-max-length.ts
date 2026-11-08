import { errorHint, SdkError, setKeyLengthLimit } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { STUDIO_BATCH_LOCK_TIMEOUT_MS } from "./review-batch.js";

export const CONFIG_KEY_REFUSAL =
  "The config's maxLength sets this key, and the config wins over verbatra.limits.json. Studio read the config when it started, so a change made to the config since needs a restart of Studio to show here.";

function withHint(error: unknown): unknown {
  if (!(error instanceof SdkError)) {
    return error;
  }
  const hint = errorHint(error);
  return hint === undefined
    ? error
    : new SdkError(error.code, `${error.message} ${hint}`, { cause: error });
}

export const keySetMaxLengthHandler: RpcHandler<"key.setMaxLength"> = async (params, deps) => {
  const { config } = deps.config;
  if (config.maxLength !== undefined && Object.hasOwn(config.maxLength, params.key)) {
    throw withHint(new SdkError("LENGTH_LIMIT_INVALID", CONFIG_KEY_REFUSAL));
  }
  try {
    return await setKeyLengthLimit(
      {
        config,
        cwd: deps.projectRoot,
        key: params.key,
        maxLength: params.maxLength,
        lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS,
      },
      {
        ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
        ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
      },
    );
  } catch (error) {
    throw withHint(error);
  }
};
