import {
  type LocaleValues,
  type LocaleValuesDeps,
  type LocaleValuesPage,
  localeValues,
  localeValuesPage,
} from "@verbatra/sdk";
import type { LocaleValuesParams } from "../../shared/rpc/locale-values.js";
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";

function sdkDeps(deps: RpcHandlerDeps): LocaleValuesDeps {
  return {
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
  };
}

function readAllLocaleValues(deps: RpcHandlerDeps): Promise<readonly LocaleValues[]> {
  return localeValues({ config: deps.config.config, cwd: deps.projectRoot }, sdkDeps(deps));
}

function readLocaleValuesPage(
  params: LocaleValuesParams,
  deps: RpcHandlerDeps,
): Promise<LocaleValuesPage> {
  return localeValuesPage(
    {
      config: deps.config.config,
      cwd: deps.projectRoot,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
      ...(params.keys !== undefined ? { keys: params.keys } : {}),
      ...(params.query !== undefined ? { query: params.query } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
      ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
    },
    sdkDeps(deps),
  );
}

export const localeValuesHandler: RpcHandler<"locale.values"> = async (params, deps) =>
  params.paged === true ? readLocaleValuesPage(params, deps) : readAllLocaleValues(deps);
