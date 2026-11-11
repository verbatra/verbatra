import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultClient } from "./client.js";
import { buildGeminiRequest } from "./request.js";

describe("createDefaultClient: Gemini API version", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = savedKey;
    }
  });

  it("calls the v1beta endpoint with the real SDK", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: unknown) => {
      urls.push(String(input instanceof Request ? input.url : input));
      return new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await createDefaultClient().models.generateContent(
      buildGeminiRequest({ model: "gemini-flash-latest", maxOutputTokens: 16 }, "{}"),
    );

    expect(urls).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    ]);
  });
});
