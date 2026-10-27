import { requireGoogleTranslateKey } from "../env.js";
import type { FetchLike } from "../network/guarded-fetch.js";
import { fetchTransport, type ProviderNetwork } from "../network/transport.js";
import { GOOGLE_TRANSLATE_ENDPOINT } from "./endpoint.js";
import type {
  GoogleTranslateClient,
  GoogleTranslateClientBundle,
  GoogleTranslateHttpResponse,
} from "./types.js";

const globalFetch: FetchLike = (input, init) => fetch(input, init);

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createDefaultClient(network?: ProviderNetwork): GoogleTranslateClientBundle {
  const apiKey = requireGoogleTranslateKey();
  const transport = fetchTransport({ id: "google-translate" }, network, globalFetch);
  const send = transport.options;
  const client: GoogleTranslateClient = {
    translate: (
      texts,
      sourceLang,
      targetLang,
      format,
      signal,
    ): Promise<GoogleTranslateHttpResponse> =>
      transport.run(async () => {
        const response = await send(
          `${GOOGLE_TRANSLATE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              q: texts,
              source: sourceLang,
              target: targetLang,
              format,
            }),
            signal,
          },
        );
        return { status: response.status, body: await parseJsonBody(response) };
      }),
  };
  return { client };
}
