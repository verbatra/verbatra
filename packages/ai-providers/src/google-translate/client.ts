import { requireGoogleTranslateKey } from "../env.js";
import { type ProviderNetwork, pinnedTransport } from "../network/transport.js";
import { GOOGLE_TRANSLATE_ENDPOINT } from "./endpoint.js";
import type {
  GoogleTranslateClient,
  GoogleTranslateClientBundle,
  GoogleTranslateHttpResponse,
} from "./types.js";

const globalFetch = (input: string, init: RequestInit): Promise<Response> => fetch(input, init);

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createDefaultClient(network?: ProviderNetwork): GoogleTranslateClientBundle {
  const apiKey = requireGoogleTranslateKey();
  const send = pinnedTransport({ id: "google-translate" }, network)?.fetch ?? globalFetch;
  const client: GoogleTranslateClient = {
    translate: async (
      texts,
      sourceLang,
      targetLang,
      signal,
    ): Promise<GoogleTranslateHttpResponse> => {
      const response = await send(
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
