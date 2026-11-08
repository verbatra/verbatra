import { errorHint, SdkError, setKeyLengthLimit } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";
import { STUDIO_BATCH_LOCK_TIMEOUT_MS } from "./review-batch.js";

export const CONFIG_KEY_REFUSAL =
  "The config's maxLength sets this key, and the config wins over verbatra.limits.json. Studio read the config when it started, so a change made to the config since needs a restart of Studio to show here.";

const SELF_DESCRIBING_CODES: ReadonlySet<string> = new Set(["LENGTH_LIMIT_INVALID"]);

const CLI_STEP = /, then run again\.?$/;

export function withoutCliStep(message: string): string {
  const kept = message.split(". ").filter((sentence) => !CLI_STEP.test(sentence));
  return kept.join(". ").replace(/\.?$/, ".");
}

const WRITE_FAILURE_CAUSE = /^Could not write .*? \((E[A-Z]+)\)\./;

const PERMISSION_CAUSES: ReadonlySet<string> = new Set(["EACCES", "EPERM"]);

export function nextStepFor(error: SdkError): string | undefined {
  if (SELF_DESCRIBING_CODES.has(error.code)) {
    return undefined;
  }
  if (error.message.startsWith("Could not write ")) {
    const cause = WRITE_FAILURE_CAUSE.exec(error.message)?.[1];
    return cause !== undefined && PERMISSION_CAUSES.has(cause) ? errorHint(error) : undefined;
  }
  return errorHint(error);
}

function withHint(error: unknown): unknown {
  if (!(error instanceof SdkError)) {
    return error;
  }
  const message = [withoutCliStep(error.message), nextStepFor(error)].filter(Boolean).join(" ");
  return new SdkError(error.code, message, { cause: error });
}

export const keySetMaxLengthHandler: RpcHandler<"key.setMaxLength"> = async (params, deps) => {
  const { config } = deps.config;
  if (
    params.maxLength !== null &&
    config.maxLength !== undefined &&
    Object.hasOwn(config.maxLength, params.key)
  ) {
    throw new SdkError("LENGTH_LIMIT_INVALID", CONFIG_KEY_REFUSAL);
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
