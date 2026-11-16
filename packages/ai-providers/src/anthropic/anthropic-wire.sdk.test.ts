import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveJsonSchema, translationsResultSchema } from "../llm/schema.js";
import { entry, regexExtractor } from "../test-support.js";
import { createAnthropicProvider } from "./anthropic-provider.js";

const MESSAGE = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "m",
  stop_reason: "end_turn",
  stop_sequence: null,
  content: [
    { type: "text", text: JSON.stringify({ translations: [{ key: "greeting", value: "Hallo" }] }) },
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
  it("sends the pinned anthropic-version and api-key header and parses a successful body", async () => {
    let seen: IncomingHttpHeaders = {};
    let sentBody = "";
    server = createServer((request, response) => {
      seen = request.headers;
      request.on("data", (chunk: Buffer) => {
        sentBody += chunk.toString();
      });
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
    expect(seen["x-api-key"]).toBe("test-key");
    expect(seen.authorization).toBeUndefined();
    expect(Object.fromEntries(result.values)).toEqual({ greeting: "Hallo" });
    const sent = JSON.parse(sentBody) as Record<string, unknown>;
    expect(sent.output_config).toEqual({
      format: { type: "json_schema", schema: deriveJsonSchema(translationsResultSchema) },
    });
    expect(sent).not.toHaveProperty("tools");
    expect(sent).not.toHaveProperty("tool_choice");
  });
});
