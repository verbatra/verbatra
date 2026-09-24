import {
  type Glossary,
  glossaryDraftCheck,
  glossaryHits,
  keyValue,
  readCurrentGlossary,
  redact,
  redactGlossary,
} from "@verbatra/sdk";
import type { GlossaryNotice } from "../../shared/rpc/key-context.js";
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";

interface GlossaryRead {
  readonly glossary: Glossary | undefined;
  readonly notice?: GlossaryNotice;
}

function codeOf(error: unknown): string {
  const code = (error as { readonly code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "GLOSSARY_UNREADABLE";
}

async function readGlossaryLeniently(deps: RpcHandlerDeps): Promise<GlossaryRead> {
  try {
    return {
      glossary: await readCurrentGlossary(
        { loaded: deps.config },
        deps.fs !== undefined ? { fs: deps.fs } : {},
      ),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { glossary: undefined, notice: { code: codeOf(error), message: redact(message) } };
  }
}

export const keyContextHandler: RpcHandler<"key.context"> = async (params, deps) => {
  const [value, glossaryRead] = await Promise.all([
    keyValue(
      { config: deps.config.config, cwd: deps.projectRoot, locale: params.locale, key: params.key },
      {
        ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
        ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
      },
    ),
    readGlossaryLeniently(deps),
  ]);
  const glossary = glossaryRead.glossary;
  const redacted = glossary === undefined ? undefined : redactGlossary(glossary).glossary;
  const sourceLocale = deps.config.config.sourceLocale;
  const maxLength = deps.config.config.maxLength?.[params.key];
  return {
    ...value,
    glossary: glossaryHits(redacted, params.locale, sourceLocale, value.source),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(glossaryRead.notice !== undefined ? { glossaryNotice: glossaryRead.notice } : {}),
    ...(params.draft !== undefined
      ? {
          draftCheck: glossaryDraftCheck({
            glossary: redacted,
            locale: params.locale,
            sourceLocale,
            source: value.source,
            draft: params.draft,
          }),
        }
      : {}),
  };
};
