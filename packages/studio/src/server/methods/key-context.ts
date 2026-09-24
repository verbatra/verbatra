import { glossaryHits, keyValue, readCurrentGlossary, redactGlossary } from "@verbatra/sdk";
import type { RpcHandler } from "../rpc.js";

export const keyContextHandler: RpcHandler<"key.context"> = async (params, deps) => {
  const [value, glossary] = await Promise.all([
    keyValue(
      { config: deps.config.config, cwd: deps.projectRoot, locale: params.locale, key: params.key },
      {
        ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
        ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
      },
    ),
    readCurrentGlossary({ loaded: deps.config }, deps.fs !== undefined ? { fs: deps.fs } : {}),
  ]);
  const redacted = glossary === undefined ? undefined : redactGlossary(glossary).glossary;
  return {
    ...value,
    glossary: glossaryHits(redacted, params.locale, deps.config.config.sourceLocale, value.source),
  };
};
