import { localeGitDiff, localeGitStatus, SdkError } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const gitStatusHandler: RpcHandler<"git.status"> = async (_params, deps) =>
  localeGitStatus(
    { config: deps.config.config, cwd: deps.projectRoot },
    deps.execFileImpl !== undefined ? { execFile: deps.execFileImpl } : {},
  );

export const gitLocaleDiffHandler: RpcHandler<"git.localeDiff"> = async (params, deps) => {
  const { sourceLocale, targetLocales } = deps.config.config;
  if (params.locale !== sourceLocale && !targetLocales.includes(params.locale)) {
    throw new SdkError(
      "UNKNOWN_LOCALE",
      "The locale is not one of this project's configured locales.",
    );
  }
  return localeGitDiff(
    { config: deps.config.config, cwd: deps.projectRoot, locale: params.locale },
    {
      ...(deps.execFileImpl !== undefined ? { execFile: deps.execFileImpl } : {}),
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
    },
  );
};
