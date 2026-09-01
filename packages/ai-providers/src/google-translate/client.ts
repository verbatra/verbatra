import { requireGoogleTranslateKey } from "../env.js";
import type {
  GoogleTranslateClient,
  GoogleTranslateClientBundle,
  GoogleTranslateHttpResponse,
} from "./types.js";

export const GOOGLE_TRANSLATE_ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
export const GOOGLE_TRANSLATE_ENDPOINT_HOST = "translation.googleapis.com";

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createDefaultClient(): GoogleTranslateClientBundle {
  const apiKey = requireGoogleTranslateKey();
  const client: GoogleTranslateClient = {
    translate: async (
      texts,
      sourceLang,
      targetLang,
      signal,
    ): Promise<GoogleTranslateHttpResponse> => {
      const response = await fetch(
        `${GOOGLE_TRANSLATE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            q: texts,
            source: sourceLang,
            target: targetLang,
            format: "text",
          }),
          signal,
        },
      );
      return { status: response.status, body: await parseJsonBody(response) };
    },
  };
  return { client };
}
