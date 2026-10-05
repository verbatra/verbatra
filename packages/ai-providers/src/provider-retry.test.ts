import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./network/guarded-fetch.js";
import { openAiStyleTransport } from "./network/transport.js";
import { observeSdkRetries, type ProviderRetry } from "./provider-retry.js";

function recordingFetch(): { fetch: FetchLike; calls: number } {
  const state = {
    calls: 0,
    fetch: (async () => {
      state.calls += 1;
      return new Response("{}");
    }) as FetchLike,
  };
  return state;
}

describe("observeSdkRetries", () => {
  it("reports an attempt for every request an SDK marks as a retry, and passes each request on", async () => {
    const inner = recordingFetch();
    const retries: ProviderRetry[] = [];
    const fetch = observeSdkRetries(inner.fetch, (retry) => retries.push(retry));

    await fetch("https://api.example.test/v1", { headers: { "X-Stainless-Retry-Count": "0" } });
    await fetch("https://api.example.test/v1", { headers: { "X-Stainless-Retry-Count": "1" } });
    await fetch(
      new Request("https://api.example.test/v1", { headers: { "x-stainless-retry-count": "2" } }),
    );

    expect(retries).toEqual([{ attempt: 2 }, { attempt: 3 }]);
    expect(inner.calls).toBe(3);
  });

  it.each([
    ["no header", undefined],
    ["a non-numeric header", { "x-stainless-retry-count": "soon" }],
    ["a negative header", { "x-stainless-retry-count": "-1" }],
  ])("reports nothing for %s", async (_label, headers) => {
    const onRetry = vi.fn();
    const fetch = observeSdkRetries(recordingFetch().fetch, onRetry);

    await fetch("https://api.example.test/v1", headers === undefined ? undefined : { headers });
    await fetch("https://api.example.test/v1");

    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe("openAiStyleTransport: retry observation", () => {
  it("leaves the SDK's own fetch in place when nobody listens", () => {
    expect(openAiStyleTransport({ id: "openai" }, undefined).options).toEqual({});
  });

  it("wraps the platform fetch when a listener is given and no policy pins the endpoint", async () => {
    const original = globalThis.fetch;
    const platform = vi.fn(async () => new Response("{}"));
    globalThis.fetch = platform as unknown as typeof globalThis.fetch;
    try {
      const retries: ProviderRetry[] = [];
      const transport = openAiStyleTransport({ id: "openai" }, undefined, (retry) =>
        retries.push(retry),
      );

      await transport.options.fetch?.("https://api.openai.com/v1/chat", {
        headers: { "x-stainless-retry-count": "1" },
      });

      expect(retries).toEqual([{ attempt: 2 }]);
      expect(platform).toHaveBeenCalledTimes(1);
      expect(transport.options.baseURL).toBeUndefined();
    } finally {
      globalThis.fetch = original;
    }
  });
});
