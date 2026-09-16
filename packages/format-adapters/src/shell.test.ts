import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "./errors.js";
import {
  buildCanHandle,
  computeIcu,
  namespaceOf,
  rethrowStructured,
  trailingLineBreaks,
} from "./shell.js";

function entry(key: string): TranslationEntry {
  return { key, namespace: "n", value: "v", placeholders: [], isPlural: false };
}

describe("namespaceOf", () => {
  it("strips the directory and extension", () => {
    expect(namespaceOf("locales/en/common.json")).toBe("common");
    expect(namespaceOf("app_en.arb")).toBe("app_en");
  });
});

describe("rethrowStructured", () => {
  it("rethrows an AdapterError unchanged", () => {
    const original = new AdapterError("INVALID_XML", "bad");
    expect(() => rethrowStructured(original, "fallback")).toThrowError(original);
  });

  it("wraps any other throw as INVALID_STRUCTURE without leaking it", () => {
    try {
      rethrowStructured(new Error("/secret"), "safe message");
      expect.unreachable();
    } catch (error) {
      expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
      expect((error as Error).message).toBe("safe message");
    }
  });
});

describe("computeIcu", () => {
  it("returns an empty array when no compute is supplied", () => {
    expect(computeIcu(new Map([["k", entry("k")]]))).toEqual([]);
  });

  it("returns the computed keys", () => {
    expect(computeIcu(new Map([["k", entry("k")]]), (entries) => [...entries.keys()])).toEqual([
      "k",
    ]);
  });

  it("wraps a non-AdapterError from compute as INVALID_STRUCTURE", () => {
    try {
      computeIcu(new Map(), () => {
        throw new Error("/secret");
      });
      expect.unreachable();
    } catch (error) {
      expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
      expect((error as Error).message).not.toContain("/secret");
    }
  });

  it("passes an AdapterError from compute through", () => {
    expect(() =>
      computeIcu(new Map(), () => {
        throw new AdapterError("MAX_DEPTH_EXCEEDED", "deep");
      }),
    ).toThrowError(AdapterError);
  });
});

describe("buildCanHandle", () => {
  it("matches the configured extensions case-insensitively", () => {
    const canHandle = buildCanHandle([".yml", ".yaml"]);
    expect(canHandle("a.yml")).toBe(true);
    expect(canHandle("a.YAML")).toBe(true);
    expect(canHandle("a.json")).toBe(false);
  });

  it("ignores the sniff when no sample is given", () => {
    const canHandle = buildCanHandle([".x"], () => false);
    expect(canHandle("a.x")).toBe(true);
  });

  it("applies the sniff to a provided sample", () => {
    const canHandle = buildCanHandle([".x"], (sample) => sample === "ok");
    expect(canHandle("a.x", "ok")).toBe(true);
    expect(canHandle("a.x", "no")).toBe(false);
  });

  it("with no sniff, the extension match alone decides even with a sample", () => {
    const canHandle = buildCanHandle([".x"]);
    expect(canHandle("a.x", "anything")).toBe(true);
  });
});

describe("trailingLineBreaks", () => {
  it.each([
    ["a\r\n", "\r\n"],
    ["a\n\n", "\n\n"],
    ["a\r", "\r"],
    ["a\r\n\r\n", "\r\n\r\n"],
    ["a\n\r", "\n\r"],
    ["", ""],
    ["\r\n", "\r\n"],
    ["a", ""],
    ["a\nb", ""],
  ])("returns the maximal trailing run of carriage returns and line feeds of %j", (input, run) => {
    expect(trailingLineBreaks(input)).toBe(run);
  });

  function countCharacterReads(content: string): { readonly run: string; readonly reads: number } {
    const { charCodeAt } = String.prototype;
    let reads = 0;
    String.prototype.charCodeAt = function (this: string, index: number): number {
      reads += 1;
      return charCodeAt.call(this, index);
    };
    try {
      return { run: trailingLineBreaks(content), reads };
    } finally {
      String.prototype.charCodeAt = charCodeAt;
    }
  }

  it("reads only the last character when a long line-break run is followed by other text", () => {
    const { run, reads } = countCharacterReads(`${"\n".repeat(100_000)}x`);
    expect(run).toBe("");
    expect(reads).toBe(1);
  });

  it("reads each character of a value made only of line breaks exactly once", () => {
    const content = "\r\n".repeat(50_000);
    const { run, reads } = countCharacterReads(content);
    expect(run).toBe(content);
    expect(reads).toBe(content.length);
  });
});
