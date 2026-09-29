import { z } from "zod";
import { ProviderError } from "../errors.js";
import { liveTableVersion, requestLanguageList } from "../language-support.js";
import type { FetchLike } from "../network/guarded-fetch.js";
import { fetchTransport } from "../network/transport.js";
import type {
  ListedLanguageSupport,
  LiveLanguageRequest,
  ProviderLanguageTable,
} from "../provider.js";
import { LIBRETRANSLATE_REQUEST_HEADERS } from "./client.js";
import { libreTranslateUrl } from "./endpoint.js";
import { LIBRETRANSLATE_LANGUAGE_TABLE } from "./languages.js";
import { toLibreTranslateCode } from "./locale-codes.js";

const LABEL = "LibreTranslate language list";

const languagesSchema = z.array(
  z.object({
    code: z.string().min(1),
    targets: z.array(z.string().min(1)).optional(),
  }),
);

const globalFetch: FetchLike = (input, init) => fetch(input, init);

export function parseLibreTranslateLanguages(body: unknown): ProviderLanguageTable {
  const parsed = languagesSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProviderError("INVALID_RESPONSE", `The ${LABEL} response could not be parsed.`);
  }
  const targets = new Set(
    parsed.data.flatMap((language) => (language.targets ?? []).map((code) => code.toLowerCase())),
  );
  return {
    version: liveTableVersion(),
    origin: "live",
    documentation: LIBRETRANSLATE_LANGUAGE_TABLE.documentation,
    languages: parsed.data.map(({ code }) => ({
      code,
      source: true,
      target: targets.has(code.toLowerCase()),
      glossary: false,
      formality: false,
    })),
  };
}

export function libreTranslateLanguageSupport(
  baseUrl: string,
  fallback: FetchLike = globalFetch,
): ListedLanguageSupport {
  const url = libreTranslateUrl(baseUrl, "languages");
  return {
    coverage: "listed",
    table: LIBRETRANSLATE_LANGUAGE_TABLE,
    toSourceCode: toLibreTranslateCode,
    toTargetCode: toLibreTranslateCode,
    fetchLive: async (request: LiveLanguageRequest): Promise<ProviderLanguageTable> => {
      const transport = fetchTransport(
        { id: "libretranslate", baseUrl },
        request.network,
        fallback,
      );
      const body = await requestLanguageList(transport, url, LIBRETRANSLATE_REQUEST_HEADERS, LABEL);
      return parseLibreTranslateLanguages(body);
    },
  };
}
