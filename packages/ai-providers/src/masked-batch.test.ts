import { describe, expect, it } from "vitest";
import { ProviderError } from "./errors.js";
import { translateMaskedBatch, zipTranslations } from "./masked-batch.js";
import { validateRequest } from "./provider.js";
import { entry, regexExtractor } from "./test-support.js";

describe("zipTranslations", () => {
  it("pairs each item with its translation by position", () => {
    expect(zipTranslations(["a", "b"], ["A", "B"])).toEqual([
      ["a", "A"],
      ["b", "B"],
    ]);
  });

  it("fails INVALID_RESPONSE when the counts differ", () => {
    expect(() => zipTranslations(["a", "b"], ["A"])).toThrow(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
    expect(() => zipTranslations(["a"], ["A", "B"])).toThrow(ProviderError);
  });

  it("fails INVALID_RESPONSE for a hole in a sparse result", () => {
    const sparse: string[] = [];
    sparse.length = 1;
    expect(() => zipTranslations(["a"], sparse)).toThrow(ProviderError);
  });
});

describe("translateMaskedBatch", () => {
  const request = {
    sourceLocale: "en",
    targetLocale: "de",
    entries: [
      entry("first", "Hi {name}", ["{name}"]),
      entry("second", "Bye"),
      entry("third", "Yo {name}", ["{name}"]),
    ],
    extractPlaceholders: regexExtractor,
  };

  it("sends each group once, in group order, and keeps values in source order of the groups", async () => {
    const sent: Array<readonly [string, readonly string[]]> = [];
    const result = await translateMaskedBatch(validateRequest(request), request, [], {
      masking: {},
      encode: (masked) => `[${masked.text}]`,
      decode: (text) => text.slice(1, -1),
      groups: ["plain", "masked"],
      groupOf: (item) => (item.masked === undefined ? "plain" : "masked"),
      send: async (texts, group) => {
        sent.push([group, texts]);
        return texts;
      },
    });
    expect(sent).toEqual([
      ["plain", ["Bye"]],
      ["masked", ["[Hi {0}]", "[Yo {0}]"]],
    ]);
    expect([...result.values]).toEqual([
      ["second", "Bye"],
      ["first", "Hi {name}"],
      ["third", "Yo {name}"],
    ]);
    expect(result.notices).toEqual([]);
  });

  it("withholds a value its encoder declines and reports it once", async () => {
    const result = await translateMaskedBatch(validateRequest(request), request, [], {
      masking: {},
      encode: (masked) => (masked.text.startsWith("Hi") ? undefined : masked.text),
      decode: (text) => text,
      groups: ["all"],
      groupOf: () => "all",
      send: async (texts) => texts,
    });
    expect([...result.values.keys()]).toEqual(["second", "third"]);
    expect(result.notices.map((notice) => notice.code)).toEqual(["PLACEHOLDER_UNSUPPORTED"]);
  });

  it("never calls send for a group with no members", async () => {
    const groups: string[] = [];
    await translateMaskedBatch(validateRequest(request), request, [], {
      masking: {},
      encode: (masked) => masked.text,
      decode: (text) => text,
      groups: ["text", "html"],
      groupOf: () => "text",
      send: async (texts, group) => {
        groups.push(group);
        return texts;
      },
    });
    expect(groups).toEqual(["text"]);
  });
});
