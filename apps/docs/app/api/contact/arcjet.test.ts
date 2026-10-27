import type { ArcjetDecision } from "@arcjet/next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ArcjetProtectClient,
  buildClient,
  checkArcjet,
  resetCachedClient,
  resolveClient,
} from "./arcjet";

function fakeDecision(options: {
  denied?: boolean;
  errored?: boolean;
  rateLimit?: boolean;
}): ArcjetDecision {
  const denied = options.denied ?? false;
  const errored = options.errored ?? false;
  const rateLimit = options.rateLimit ?? false;
  return {
    isDenied: () => denied,
    isErrored: () => errored,
    isAllowed: () => !denied && !errored,
    isChallenged: () => false,
    reason: { isRateLimit: () => rateLimit },
  } as unknown as ArcjetDecision;
}

function stubClient(decision: ArcjetDecision): {
  client: ArcjetProtectClient;
  protect: ReturnType<typeof vi.fn>;
} {
  const protect = vi.fn().mockResolvedValue(decision);
  return { client: { protect }, protect };
}

const originalArcjetKey = process.env.ARCJET_KEY;

beforeEach(() => {
  resetCachedClient();
});

afterEach(() => {
  resetCachedClient();
  if (originalArcjetKey === undefined) {
    delete process.env.ARCJET_KEY;
  } else {
    process.env.ARCJET_KEY = originalArcjetKey;
  }
});

describe("checkArcjet", () => {
  it("returns undefined (allowed) when the decision is neither denied nor errored", async () => {
    const { client } = stubClient(fakeDecision({}));
    const result = await checkArcjet(new Request("http://localhost/api/contact"), { client });
    expect(result).toBeUndefined();
  });

  it("returns a 429 response when the decision is a denied rate limit", async () => {
    const { client } = stubClient(fakeDecision({ denied: true, rateLimit: true }));
    const result = await checkArcjet(new Request("http://localhost/api/contact"), { client });
    expect(result?.status).toBe(429);
  });

  it("returns a 403 response when the decision is denied for a non-rate-limit reason", async () => {
    const { client } = stubClient(fakeDecision({ denied: true }));
    const result = await checkArcjet(new Request("http://localhost/api/contact"), { client });
    expect(result?.status).toBe(403);
  });

  it("returns a 500 response when the decision is errored", async () => {
    const { client } = stubClient(fakeDecision({ errored: true }));
    const result = await checkArcjet(new Request("http://localhost/api/contact"), { client });
    expect(result?.status).toBe(500);
  });

  it("returns a 500 response and never leaks the raw error when protect() throws", async () => {
    const client: ArcjetProtectClient = {
      protect: vi.fn().mockRejectedValue(new Error("network down")),
    };
    const result = await checkArcjet(new Request("http://localhost/api/contact"), { client });
    expect(result?.status).toBe(500);
    const body = (await result?.json()) as { status: string };
    expect(JSON.stringify(body)).not.toContain("network down");
  });

  it("fails closed with a 500 response when ARCJET_KEY is unset and no client is injected", async () => {
    delete process.env.ARCJET_KEY;
    const result = await checkArcjet(new Request("http://localhost/api/contact"));
    expect(result?.status).toBe(500);
  });
});

describe("buildClient", () => {
  it("constructs a real Arcjet client exposing a protect method", () => {
    const client = buildClient("test-key");
    expect(typeof client.protect).toBe("function");
  });
});

describe("resolveClient", () => {
  it("builds and caches a real client when ARCJET_KEY is set and no client is injected", () => {
    process.env.ARCJET_KEY = "test-key";
    const first = resolveClient({});
    const second = resolveClient({});
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  it("returns undefined when ARCJET_KEY is only whitespace", () => {
    process.env.ARCJET_KEY = "   ";
    expect(resolveClient({})).toBeUndefined();
  });

  it("returns the injected client without touching ARCJET_KEY", () => {
    delete process.env.ARCJET_KEY;
    const client: ArcjetProtectClient = { protect: vi.fn() };
    expect(resolveClient({ client })).toBe(client);
  });
});

describe("the server-only guard", () => {
  it("imports server-only first, so a client component that reaches the Arcjet key fails the build", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./arcjet.ts", import.meta.url), "utf8");
    expect(source.startsWith('import "server-only";\n')).toBe(true);
  });
});
