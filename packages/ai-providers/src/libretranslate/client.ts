import { readLibreTranslateKey } from "../env.js";
import type { FetchLike } from "../network/guarded-fetch.js";
import { fetchTransport, type ProviderNetwork } from "../network/transport.js";
import { libreTranslateUrl } from "./endpoint.js";
import type { LibreTranslateClientBundle, LibreTranslateHttpResponse } from "./types.js";

const globalFetch: FetchLike = (input, init) => fetch(input, init);

export const LIBRETRANSLATE_REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "application/json",
  "accept-language": "en",
  "x-override-accept-language": "en",
};

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createDefaultClient(
  baseUrl: string,
  network?: ProviderNetwork,
  fallback: FetchLike = globalFetch,
): LibreTranslateClientBundle {
  const apiKey = readLibreTranslateKey();
  const transport = fetchTransport({ id: "libretranslate", baseUrl }, network, fallback);
  const send = transport.options;
  const url = libreTranslateUrl(baseUrl, "translate");
  return {
    keyConfigured: apiKey !== undefined,
    client: {
      translate: (
        texts,
        sourceLang,
        targetLang,
        format,
        signal,
      ): Promise<LibreTranslateHttpResponse> =>
        transport.run(async () => {
          const response = await send(url, {
            method: "POST",
            headers: { ...LIBRETRANSLATE_REQUEST_HEADERS },
            body: JSON.stringify({
              q: texts,
              source: sourceLang,
              target: targetLang,
              format,
              ...(apiKey === undefined ? {} : { api_key: apiKey }),
            }),
            signal,
          });
          return { status: response.status, body: await parseJsonBody(response) };
        }),
    },
  };
}
