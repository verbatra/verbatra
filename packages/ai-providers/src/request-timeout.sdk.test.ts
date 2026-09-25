import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderError } from "./errors.js";
import { createOpenAiCompatibleProvider } from "./openai-compatible/openai-compatible-provider.js";

type Scenario = "429" | "500" | "hang";

let server: Server | undefined;
let requests = 0;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) =>
    server === undefined ? resolve() : server.close(() => resolve()),
  );
  server = undefined;
  requests = 0;
});

async function stubServer(scenario: Scenario): Promise<string> {
  server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      requests += 1;
      if (scenario === "hang") {
        return;
      }
      const status = scenario === "429" ? 429 : 500;
      response.writeHead(status, { "content-type": "application/json", "retry-after-ms": "600" });
      response.end(JSON.stringify({ error: { message: "upstream" } }));
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/v1`;
}

async function closedPortUrl(): Promise<string> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return `http://127.0.0.1:${port}/v1`;
}

async function translateAgainst(baseUrl: string, requestTimeoutMs: number): Promise<ProviderError> {
  const provider = createOpenAiCompatibleProvider({
    baseUrl,
    model: "m",
    maxOutputTokens: 64,
    requestTimeoutMs,
  });
  const caught = await provider
    .translateBatch({
      sourceLocale: "en",
      targetLocale: "de",
      entries: [
        { key: "greeting", namespace: "", value: "Hello", placeholders: [], isPlural: false },
      ],
      extractPlaceholders: () => [],
    })
    .catch((error: unknown) => error);
  expect(caught).toBeInstanceOf(ProviderError);
  return caught as ProviderError;
}

describe("requestTimeoutMs through the real OpenAI SDK client: a per-attempt bound", () => {
  it("reports a 429 that outlasts the timeout across retries as RATE_LIMITED", async () => {
    const error = await translateAgainst(await stubServer("429"), 1000);
    expect(error.code).toBe("RATE_LIMITED");
    expect(requests).toBe(3);
  });

  it("reports a 500 that outlasts the timeout across retries as PROVIDER_UNAVAILABLE", async () => {
    const error = await translateAgainst(await stubServer("500"), 1000);
    expect(error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(requests).toBe(3);
  });

  it("reports a refused connection as the refusal, not as a timeout", async () => {
    const error = await translateAgainst(await closedPortUrl(), 1000);
    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toContain("the connection was refused");
  });

  it("times out each hanging attempt and names the configured bound", async () => {
    const error = await translateAgainst(await stubServer("hang"), 200);
    expect(error.code).toBe("TIMEOUT");
    expect(error.message).toContain("200 ms");
    expect(requests).toBe(3);
  });
});
