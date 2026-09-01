import { type GlossaryFileDeps, readGlossaryFile, redact, updateGlossaryTerm } from "@verbatra/sdk";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import { projectGlossaryIndicator } from "../projection.js";
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";

function fsDeps(deps: RpcHandlerDeps): GlossaryFileDeps {
  return deps.fs !== undefined ? { fs: deps.fs } : {};
}

async function currentEntries(deps: RpcHandlerDeps): Promise<Readonly<Record<string, string>>> {
  if (deps.config.glossary.source === "file") {
    return readGlossaryFile({ glossary: deps.config.glossary }, fsDeps(deps));
  }
  return deps.config.config.glossary ?? {};
}

function buildResult(
  deps: RpcHandlerDeps,
  entries: Readonly<Record<string, string>>,
): GlossaryGetResult {
  const redacted: Record<string, string> = {};
  const redactedTerms: string[] = [];
  for (const [term, value] of Object.entries(entries)) {
    const safe = redact(value);
    redacted[term] = safe;
    if (safe !== value) {
      redactedTerms.push(term);
    }
  }
  return {
    indicator: projectGlossaryIndicator(deps.config.glossary, deps.projectRoot),
    entries: redacted,
    redactedTerms,
  };
}

export const glossaryGetHandler: RpcHandler<"glossary.get"> = async (_params, deps) =>
  buildResult(deps, await currentEntries(deps));

export const glossaryWriteHandler: RpcHandler<"glossary.write"> = async (params, deps) => {
  const entries = await updateGlossaryTerm(
    {
      glossary: deps.config.glossary,
      cwd: deps.projectRoot,
      term: params.term,
      translation: params.translation,
    },
    fsDeps(deps),
  );
  return buildResult(deps, entries);
};
