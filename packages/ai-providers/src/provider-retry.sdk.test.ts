import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createOpenAiCompatibleProvider } from "./openai-compatible/openai-compatible-provider.js";
import type { ProviderRetry } from "./provider-retry.js";

const COMPLETION = {
  id: "c1",
  object: "chat.completion",
  created: 0,
  model: "m",
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: JSON.stringify({ translations: [{ key: "greeting", value: "Hallo" }] }),
      },
    },
  ],
  usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
};

let server: Server | undefined;

afterEach(async () => {
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
        response.writeHead(503, { "content-type": "application/json", "retry-after-ms": "1" });
        response.end(JSON.stringify({ error: { message: "busy" } }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(COMPLETION));
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/v1`;
}

describe("provider retries through the real OpenAI SDK client", () => {
  it("reports each retry the SDK makes after a retryable status", async () => {
    const baseUrl = await flakyServer(2);
    const retries: ProviderRetry[] = [];
    const provider = createOpenAiCompatibleProvider(
      { baseUrl, model: "m", maxOutputTokens: 64 },
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
