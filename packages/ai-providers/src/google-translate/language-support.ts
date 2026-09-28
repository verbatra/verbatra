import { z } from "zod";
import { requireGoogleTranslateKey } from "../env.js";
import { ProviderError } from "../errors.js";
import { liveTableVersion, requestLanguageList } from "../language-support.js";
import type { FetchLike } from "../network/guarded-fetch.js";
import { fetchTransport } from "../network/transport.js";
import type {
  ListedLanguageSupport,
  LiveLanguageRequest,
  ProviderLanguageTable,
} from "../provider.js";
import { GOOGLE_TRANSLATE_ENDPOINT } from "./endpoint.js";
import { GOOGLE_TRANSLATE_LANGUAGE_TABLE } from "./languages.js";
import { toGoogleTranslateCode } from "./locale-codes.js";

const LANGUAGES_URL = `${GOOGLE_TRANSLATE_ENDPOINT}/languages`;
const LABEL = "Google Cloud Translation language list";

const languagesSchema = z.object({
  data: z.object({
    languages: z.array(z.object({ language: z.string().min(1) })),
  }),
});

const globalFetch: FetchLike = (input, init) => fetch(input, init);

export function parseGoogleTranslateLanguages(body: unknown): ProviderLanguageTable {
  const parsed = languagesSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProviderError("INVALID_RESPONSE", `The ${LABEL} response could not be parsed.`);
  }
  return {
    version: liveTableVersion(),
    origin: "live",
    documentation: [LANGUAGES_URL],
    languages: parsed.data.data.languages.map(({ language }) => ({
      code: language,
      source: true,
      target: true,
      glossary: false,
      formality: false,
    })),
  };
}

async function fetchGoogleTranslateLanguages(
  request: LiveLanguageRequest,
): Promise<ProviderLanguageTable> {
  const apiKey = requireGoogleTranslateKey();
  const transport = fetchTransport({ id: "google-translate" }, request.network, globalFetch);
  const body = await requestLanguageList(
    transport,
    `${LANGUAGES_URL}?key=${encodeURIComponent(apiKey)}`,
    {},
    LABEL,
  );
  return parseGoogleTranslateLanguages(body);
}

export const googleTranslateLanguageSupport: ListedLanguageSupport = {
  coverage: "listed",
  table: GOOGLE_TRANSLATE_LANGUAGE_TABLE,
  toSourceCode: toGoogleTranslateCode,
  toTargetCode: toGoogleTranslateCode,
  fetchLive: fetchGoogleTranslateLanguages,
};
