import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { entry, regexExtractor } from "../test-support.js";
import { createAnthropicProvider } from "./anthropic-provider.js";
import { SUBMIT_TOOL_NAME } from "./request.js";

const MESSAGE = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "m",
  stop_reason: "tool_use",
  stop_sequence: null,
  content: [
    {
      type: "tool_use",
      id: "toolu_1",
      name: SUBMIT_TOOL_NAME,
      input: { translations: [{ key: "greeting", value: "Hallo" }] },
    },
  ],
  usage: { input_tokens: 3, output_tokens: 2 },
};

let server: Server | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) =>
    server === undefined ? resolve() : server.close(() => resolve()),
  );
  server = undefined;
});

describe("anthropic wire contract through the real SDK client", () => {
  it("sends the pinned anthropic-version and parses a successful body", async () => {
    let seen: IncomingHttpHeaders = {};
    server = createServer((request, response) => {
      seen = request.headers;
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(MESSAGE));
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    vi.stubEnv("ANTHROPIC_BASE_URL", `http://127.0.0.1:${port}`);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const provider = createAnthropicProvider({ model: "m", maxTokens: 64 });

    const result = await provider.translateBatch({
      sourceLocale: "en",
      targetLocale: "de",
      entries: [entry("greeting", "Hello")],
      extractPlaceholders: regexExtractor,
    });

    expect(seen["anthropic-version"]).toBe("2023-06-01");
    expect(Object.fromEntries(result.values)).toEqual({ greeting: "Hallo" });
  });
});
