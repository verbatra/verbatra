import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateForWrite } from "./run.ts";
import { stubbedRequest } from "./test-support.ts";

const vendor = vi.hoisted(() => ({
  generateContent: vi.fn(async (_request: unknown): Promise<unknown> => {
    throw Object.assign(new Error("Resource exhausted"), { status: 429 });
  }),
}));

const genaiEntry = await vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const { realpathSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const sdkEntry = realpathSync(fileURLToPath(import.meta.resolve("@verbatra/sdk")));
  const genaiRequireEntry = createRequire(sdkEntry).resolve("@google/genai");
  return join(dirname(genaiRequireEntry), "index.mjs");
});

vi.mock(genaiEntry, () => ({
  GoogleGenAI: class {
    readonly models = { generateContent: vendor.generateContent };
  },
}));

const fetchSpy = vi.fn(() => {
  throw new Error("network is forbidden in this test");
});

function realProviderRequest(attemptCap?: number) {
  const { runRequest } = stubbedRequest();
  const { createProvider: _stub, ...withoutStub } = runRequest;
  return attemptCap === undefined ? withoutStub : { ...withoutStub, attemptCap };
}

beforeEach(() => {
  vendor.generateContent.mockClear();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubEnv("GEMINI_API_KEY", "placeholder-for-tests");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("translateForWrite through the real Gemini provider (vendor client mocked)", () => {
  it("mocks the vendor module the SDK actually loads", () => {
    expect(genaiEntry).toMatch(/@google\/genai\/dist\/node\/index\.mjs$/);
  });

  it("stops on the first 429 retry: one vendor call, no further attempt, after the 250 ms backoff", async () => {
    const started = performance.now();
    const outcome = await translateForWrite(realProviderRequest());
    const elapsed = performance.now() - started;
    expect(outcome).toMatchObject({ kind: "stopped", reason: "rate-limited" });
    expect(vendor.generateContent).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(elapsed).toBeGreaterThanOrEqual(240);
  });

  it("aborts on a non-retryable 403 after one vendor call and reports a provider failure", async () => {
    vendor.generateContent.mockRejectedValueOnce(
      Object.assign(new Error("Permission denied"), { status: 403 }),
    );
    const outcome = await translateForWrite(realProviderRequest());
    expect(outcome.kind).toBe("provider-failed");
    expect(vendor.generateContent).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends nothing once the attempt cap has aborted the signal", async () => {
    const outcome = await translateForWrite(realProviderRequest(0));
    expect(outcome).toMatchObject({ kind: "stopped", reason: "attempt-cap" });
    expect(vendor.generateContent).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
