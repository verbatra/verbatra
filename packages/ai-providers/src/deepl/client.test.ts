import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const events = vi.hoisted(() => [] as unknown[]);

vi.mock("deepl-node", () => ({
  Translator: class {
    constructor(...args: unknown[]) {
      events.push(["construct", ...args]);
    }
    async translateText(): Promise<unknown[]> {
      return [];
    }
  },
}));

vi.mock("./log-suppression.js", () => ({
  silenceSdkLogging: async () => {
    events.push("silence");
  },
}));

const { createDefaultClient } = await import("./client.js");

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.DEEPL_API_KEY;
  process.env.DEEPL_API_KEY = "test-key-value:fx";
  events.length = 0;
});

afterEach(() => {
  if (saved === undefined) {
    delete process.env.DEEPL_API_KEY;
  } else {
    process.env.DEEPL_API_KEY = saved;
  }
});

describe("createDefaultClient: request timeout", () => {
  it("hands the timeout to deepl-node as the per-attempt minimum", async () => {
    await createDefaultClient(5000).client.translateText(["a"], null, "de", {});
    expect(events).toContainEqual(["construct", "test-key-value:fx", { minTimeout: 5000 }]);
  });

  it("detects a free account from the key suffix", () => {
    expect(createDefaultClient(5000).freeAccount).toBe(true);
  });
});

describe("createDefaultClient: lazy construction", () => {
  it("reads the key at construction, so a missing key throws before any call", () => {
    delete process.env.DEEPL_API_KEY;
    expect(() => createDefaultClient(5000)).toThrow(
      expect.objectContaining({ code: "MISSING_API_KEY" }),
    );
  });

  it("loads nothing until the first call", () => {
    createDefaultClient(5000);
    expect(events).toEqual([]);
  });

  it("silences the SDK logger before constructing the translator, once across calls", async () => {
    const { client } = createDefaultClient(5000);
    await Promise.all([
      client.translateText(["a"], null, "de", {}),
      client.translateText(["b"], null, "de", {}),
    ]);
    await client.translateText(["c"], null, "de", {});
    expect(events).toEqual(["silence", ["construct", "test-key-value:fx", { minTimeout: 5000 }]]);
  });
});
