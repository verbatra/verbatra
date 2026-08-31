import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors.js";
import { createDefaultClient, GOOGLE_TRANSLATE_ENDPOINT } from "./client.js";

describe("createDefaultClient", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.GOOGLE_TRANSLATE_API_KEY;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.GOOGLE_TRANSLATE_API_KEY;
    } else {
      process.env.GOOGLE_TRANSLATE_API_KEY = saved;
    }
    vi.unstubAllGlobals();
  });

  it("throws MISSING_API_KEY before any fetch call when the env var is unset", () => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    expect(() => createDefaultClient()).toThrow(ProviderError);
  });

  it("sends the key as a query parameter and the texts/locales/format in the JSON body", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = `AIza${"a".repeat(35)}`;
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ data: { translations: [{ translatedText: "Hallo" }] } }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { client } = createDefaultClient();
    const controller = new AbortController();
    const result = await client.translate(["Hello"], "en", "de", controller.signal);

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("expected fetch to have been called");
    }
    const [url, init] = call;
    expect(url.startsWith(GOOGLE_TRANSLATE_ENDPOINT)).toBe(true);
    expect(url).toContain(`key=AIza${"a".repeat(35)}`);
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(init.body as string)).toEqual({
      q: ["Hello"],
      source: "en",
      target: "de",
      format: "text",
    });
  });

  it("returns an undefined body rather than throwing when the response is not valid JSON", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = `AIza${"a".repeat(35)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 500 })),
    );

    const { client } = createDefaultClient();
    const result = await client.translate(["Hello"], "en", "de", new AbortController().signal);
    expect(result.status).toBe(500);
    expect(result.body).toBeUndefined();
  });
});
