import { z } from "zod";
import { processEnvironment, requireDeepLKey } from "../env.js";
import { ProviderError } from "../errors.js";
import { liveTableVersion, requestLanguageList } from "../language-support.js";
import { resolveProviderEndpoint } from "../network/endpoints.js";
import type { FetchLike } from "../network/guarded-fetch.js";
import { fetchTransport } from "../network/transport.js";
import type {
  ListedLanguageSupport,
  LiveLanguageRequest,
  ProviderLanguageTable,
} from "../provider.js";
import { DEEPL_LANGUAGE_TABLE } from "./languages.js";
import { toDeepLSourceCode, toDeepLTargetCode } from "./locale-codes.js";

const LANGUAGES_PATH = "/v3/languages?resource=translate_text";
const LABEL = "DeepL language list";

const languagesSchema = z.array(
  z.object({
    lang: z.string().min(1),
    usable_as_source: z.boolean(),
    usable_as_target: z.boolean(),
    features: z.record(z.string(), z.unknown()).optional(),
  }),
);

const globalFetch: FetchLike = (input, init) => fetch(input, init);

export function parseDeepLLanguages(body: unknown, url: string): ProviderLanguageTable {
  const parsed = languagesSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProviderError("INVALID_RESPONSE", `The ${LABEL} response could not be parsed.`);
  }
  return {
    version: liveTableVersion(),
    origin: "live",
    documentation: [url],
    languages: parsed.data.map((language) => ({
      code: language.lang,
      source: language.usable_as_source,
      target: language.usable_as_target,
      glossary: Object.hasOwn(language.features ?? {}, "glossary"),
      formality: Object.hasOwn(language.features ?? {}, "formality"),
    })),
  };
}

async function fetchDeepLLanguages(request: LiveLanguageRequest): Promise<ProviderLanguageTable> {
  const authKey = requireDeepLKey();
  const env = request.network?.env ?? processEnvironment();
  const url = `${resolveProviderEndpoint({ id: "deepl" }, env).url}${LANGUAGES_PATH}`;
  const transport = fetchTransport({ id: "deepl" }, request.network, globalFetch);
  const body = await requestLanguageList(
    transport,
    url,
    { authorization: `DeepL-Auth-Key ${authKey}` },
    LABEL,
  );
  return parseDeepLLanguages(body, url);
}

export const deepLLanguageSupport: ListedLanguageSupport = {
  coverage: "listed",
  table: DEEPL_LANGUAGE_TABLE,
  toSourceCode: toDeepLSourceCode,
  toTargetCode: toDeepLTargetCode,
  fetchLive: fetchDeepLLanguages,
};
