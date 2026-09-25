import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructed = vi.hoisted(() => [] as unknown[]);

vi.mock("deepl-node", () => ({
  Translator: class {
    constructor(...args: unknown[]) {
      constructed.push(args);
    }
  },
}));

vi.mock("./log-suppression.js", () => ({ silenceSdkLogging: () => undefined }));

const { createDefaultClient } = await import("./client.js");

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.DEEPL_API_KEY;
  process.env.DEEPL_API_KEY = "test-key-value:fx";
  constructed.length = 0;
});

afterEach(() => {
  if (saved === undefined) {
    delete process.env.DEEPL_API_KEY;
  } else {
    process.env.DEEPL_API_KEY = saved;
  }
});

describe("createDefaultClient: request timeout", () => {
  it("hands the timeout to deepl-node as the per-attempt minimum", () => {
    createDefaultClient(5000);
    expect(constructed).toEqual([["test-key-value:fx", { minTimeout: 5000 }]]);
  });

  it("detects a free account from the key suffix", () => {
    expect(createDefaultClient(5000).freeAccount).toBe(true);
  });
});
