import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderRetry } from "../provider-retry.js";
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

async function flakyServer(failures: number): Promise<string> {
  let requests = 0;
  server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      requests += 1;
      if (requests <= failures) {
        response.writeHead(529, { "content-type": "application/json", "retry-after-ms": "1" });
        response.end(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(MESSAGE));
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("provider retries through the real Anthropic SDK client", () => {
  it("reports each retry the SDK makes after a retryable status", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", await flakyServer(2));
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const retries: ProviderRetry[] = [];
    const provider = createAnthropicProvider(
      { model: "m", maxTokens: 64 },
      { onRetry: (retry) => retries.push(retry) },
    );

    const result = await provider.translateBatch({
      sourceLocale: "en",
      targetLocale: "de",
      entries: [
        { key: "greeting", namespace: "", value: "Hello", placeholders: [], isPlural: false },
      ],
      extractPlaceholders: () => [],
    });

    expect(retries).toEqual([{ attempt: 2 }, { attempt: 3 }]);
    expect(result.values.get("greeting")).toBe("Hallo");
  });
});
