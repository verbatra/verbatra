import { previewIcuMessage, SdkError } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const keyPreviewIcuHandler: RpcHandler<"key.previewIcu"> = async (params, deps) => {
  const { sourceLocale, targetLocales } = deps.config.config;
  if (params.locale !== sourceLocale && !targetLocales.includes(params.locale)) {
    throw new SdkError(
      "UNKNOWN_LOCALE",
      "The locale is not one of this project's configured locales.",
    );
  }
  return previewIcuMessage({
    config: deps.config.config,
    locale: params.locale,
    value: params.value,
    ...(params.args !== undefined ? { args: Object.fromEntries(Object.entries(params.args)) } : {}),
  });
};
