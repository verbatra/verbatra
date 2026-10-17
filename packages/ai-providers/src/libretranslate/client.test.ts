import { afterEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../network/guarded-fetch.js";
import type { NetworkPolicy } from "../network/policy.js";
import { createDefaultClient } from "./client.js";

const LOCAL_ONLY: NetworkPolicy = {
  rules: [{ source: "config", policy: "local-only", allowedHosts: [] }],
};

function recordingFetch(
  body: unknown,
  status = 200,
): {
  fetch: FetchLike;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch: FetchLike = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

function sentBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("createDefaultClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("posts the texts as a batch in text format to the translate endpoint, without a key", async () => {
    vi.stubEnv("LIBRETRANSLATE_API_KEY", "");
    const { fetch, calls } = recordingFetch({ translatedText: ["Hallo"] });
    const bundle = createDefaultClient("http://localhost:5000/", undefined, fetch);

    const result = await bundle.client.translate(
      ["Hello"],
      "en",
      "de",
      "text",
      new AbortController().signal,
    );

    expect(bundle.keyConfigured).toBe(false);
    expect(result).toEqual({ status: 200, body: { translatedText: ["Hallo"] } });
    expect(calls[0]?.url).toBe("http://localhost:5000/translate");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(sentBody(calls[0]?.init)).toEqual({
      q: ["Hello"],
      source: "en",
      target: "de",
      format: "text",
    });
    expect(new Headers(calls[0]?.init?.headers).get("accept-language")).toBe("en");
  });

  it("sends the format it is given, so markup can go out as html", async () => {
    const { fetch, calls } = recordingFetch({ translatedText: ["<b>Hallo</b>"] });
    const bundle = createDefaultClient("http://localhost:5000", undefined, fetch);

    await bundle.client.translate(
      ["<b>Hello</b>"],
      "en",
      "de",
      "html",
      new AbortController().signal,
    );

    expect(sentBody(calls[0]?.init).format).toBe("html");
  });

  it("sends LIBRETRANSLATE_API_KEY as api_key when it is set", async () => {
    vi.stubEnv("LIBRETRANSLATE_API_KEY", "lt-key-123456");
    const { fetch, calls } = recordingFetch({ translatedText: ["Hallo"] });
    const bundle = createDefaultClient("https://lt.example.test/api", undefined, fetch);

    await bundle.client.translate(["Hello"], "en", "de", "text", new AbortController().signal);

    expect(bundle.keyConfigured).toBe(true);
    expect(calls[0]?.url).toBe("https://lt.example.test/api/translate");
    expect(sentBody(calls[0]?.init).api_key).toBe("lt-key-123456");
  });

  it("returns an undefined body when the response is not JSON", async () => {
    const fetch: FetchLike = async () => new Response("<html>", { status: 502 });
    const bundle = createDefaultClient("http://localhost:5000", undefined, fetch);

    const result = await bundle.client.translate(
      ["x"],
      "en",
      "de",
      "text",
      new AbortController().signal,
    );

    expect(result).toEqual({ status: 502, body: undefined });
  });

  it("sends through the policy-checked fetch when a network policy applies", async () => {
    const { fetch, calls } = recordingFetch({ translatedText: ["Hallo"] });
    const bundle = createDefaultClient("http://127.0.0.1:5000", {
      policy: LOCAL_ONLY,
      env: {},
      deps: { fetch },
    });

    await bundle.client.translate(["Hello"], "en", "de", "text", new AbortController().signal);

    expect(calls[0]?.url).toBe("http://127.0.0.1:5000/translate");
  });

  it("refuses a remote host under local-only before anything is sent", async () => {
    const { fetch, calls } = recordingFetch({ translatedText: ["Hallo"] });
    const bundle = createDefaultClient("http://203.0.113.7:5000", {
      policy: LOCAL_ONLY,
      env: {},
      deps: { fetch },
    });

    await expect(
      bundle.client.translate(["Hello"], "en", "de", "text", new AbortController().signal),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
