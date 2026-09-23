import {
  type Glossary,
  type GlossaryFileDeps,
  type GlossaryTerm,
  glossaryForLocale,
  normalizeGlossary,
  readGlossaryFile,
  redactGlossary,
  SdkError,
  updateGlossaryTerm,
} from "@verbatra/sdk";
import type {
  GlossaryGetResult,
  GlossaryLocaleView,
  GlossaryTermView,
} from "../../shared/rpc/glossary.js";
import { projectGlossaryIndicator } from "../projection.js";
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";

const EMPTY_GLOSSARY: Glossary = { version: 2, terms: [], doNotTranslate: [] };

function fsDeps(deps: RpcHandlerDeps): GlossaryFileDeps {
  return deps.fs !== undefined ? { fs: deps.fs } : {};
}

async function currentGlossary(deps: RpcHandlerDeps): Promise<Glossary | undefined> {
  if (deps.config.glossary.source === "file") {
    return readGlossaryFile({ glossary: deps.config.glossary }, fsDeps(deps));
  }
  const inline = deps.config.config.glossary;
  return inline === undefined ? undefined : normalizeGlossary(inline);
}

function hasOwnEntry(record: Readonly<Record<string, unknown>>, locale: string): boolean {
  const wanted = locale.toLowerCase();
  return Object.keys(record).some((key) => key.toLowerCase() === wanted);
}

function localeViews(
  glossary: Glossary,
  locales: readonly string[],
): ReadonlyMap<string, ReadonlyMap<string, GlossaryLocaleView>> {
  const views = new Map<string, Map<string, GlossaryLocaleView>>();
  for (const locale of locales) {
    for (const term of glossaryForLocale(glossary, locale)?.terms ?? []) {
      const own = glossary.terms.find((candidate) => candidate.source === term.source);
      const byLocale = views.get(term.source) ?? new Map<string, GlossaryLocaleView>();
      byLocale.set(locale, {
        ...(term.target !== undefined ? { target: term.target } : {}),
        inherited: own === undefined || !hasOwnEntry(own.targets, locale),
        forbidden: [...term.forbidden],
      });
      views.set(term.source, byLocale);
    }
  }
  return views;
}

function termView(
  term: GlossaryTerm,
  byLocale: ReadonlyMap<string, GlossaryLocaleView> | undefined,
): GlossaryTermView {
  return {
    ...term,
    targets: { ...term.targets },
    forbidden: { ...term.forbidden },
    byLocale: Object.fromEntries(byLocale ?? []),
  };
}

function buildResult(deps: RpcHandlerDeps, loaded: Glossary | undefined): GlossaryGetResult {
  const { glossary, redactedTerms } = redactGlossary(loaded ?? EMPTY_GLOSSARY);
  const locales = deps.config.config.targetLocales;
  const views = localeViews(glossary, locales);
  return {
    indicator: projectGlossaryIndicator(deps.config.glossary, deps.projectRoot),
    version: loaded === undefined ? null : loaded.version,
    locales: [...locales],
    terms: glossary.terms.map((term) => termView(term, views.get(term.source))),
    doNotTranslate: [...glossary.doNotTranslate],
    redactedTerms: [...redactedTerms],
  };
}

export const glossaryGetHandler: RpcHandler<"glossary.get"> = async (_params, deps) =>
  buildResult(deps, await currentGlossary(deps));

export const glossaryWriteHandler: RpcHandler<"glossary.write"> = async (params, deps) => {
  if (params.locale !== undefined && !deps.config.config.targetLocales.includes(params.locale)) {
    throw new SdkError(
      "UNKNOWN_LOCALE",
      `"${params.locale}" is not one of the configured target locales.`,
    );
  }
  const glossary = await updateGlossaryTerm(
    {
      glossary: deps.config.glossary,
      cwd: deps.projectRoot,
      term: params.term,
      ...(params.translation !== undefined ? { translation: params.translation } : {}),
      ...(params.locale !== undefined ? { locale: params.locale } : {}),
      ...(params.forbidden !== undefined ? { forbidden: params.forbidden } : {}),
      ...(params.note !== undefined ? { note: params.note } : {}),
      ...(params.partOfSpeech !== undefined ? { partOfSpeech: params.partOfSpeech } : {}),
      ...(params.caseSensitive !== undefined ? { caseSensitive: params.caseSensitive } : {}),
      ...(params.doNotTranslate !== undefined ? { doNotTranslate: params.doNotTranslate } : {}),
    },
    fsDeps(deps),
  );
  return buildResult(deps, glossary);
};
