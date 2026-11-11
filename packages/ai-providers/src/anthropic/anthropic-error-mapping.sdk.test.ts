import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors.js";
import { createAnthropicProvider } from "./anthropic-provider.js";

let server: Server | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) =>
    server === undefined ? resolve() : server.close(() => resolve()),
  );
  server = undefined;
});

async function serverAnswering(status: number, type: string): Promise<string> {
  server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.writeHead(status, { "content-type": "application/json", "x-should-retry": "false" });
      response.end(JSON.stringify({ type: "error", error: { type, message: "upstream detail" } }));
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function failureFor(status: number, type: string): Promise<ProviderError> {
  vi.stubEnv("ANTHROPIC_BASE_URL", await serverAnswering(status, type));
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  const provider = createAnthropicProvider({ model: "m", maxTokens: 64 });
  const error = await provider
    .translateBatch({
      sourceLocale: "en",
      targetLocale: "de",
      entries: [
        { key: "greeting", namespace: "", value: "Hello", placeholders: [], isPlural: false },
      ],
      extractPlaceholders: () => [],
    })
    .then(
      () => undefined,
      (caught: unknown) => caught,
    );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

describe("anthropic error mapping through the real SDK client", () => {
  it.each([
    [401, "authentication_error", "AUTH_FAILED"],
    [429, "rate_limit_error", "RATE_LIMITED"],
    [400, "invalid_request_error", "PROVIDER_ERROR"],
    [500, "api_error", "PROVIDER_UNAVAILABLE"],
  ])("maps HTTP %i (%s) to %s", async (status, type, code) => {
    const error = await failureFor(status, type);

    expect(error.code).toBe(code);
    expect(error.message).toContain(`HTTP ${status}`);
    expect(error.message).not.toContain("test-key");
  });
});
