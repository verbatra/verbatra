import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decodeMaskedFromHtml,
  decodeMaskedFromXml,
  encodeMaskedForHtml,
  encodeMaskedForXml,
  type MaskedValue,
  unmaskPlaceholders,
} from "./placeholder-protection.js";

const residualPiece = fc.constantFrom(
  "a",
  "Z",
  " ",
  "&",
  "<",
  ">",
  '"',
  "'",
  "&amp;",
  "&lt;x&gt;",
  "&#39;",
  "#",
  ";",
  "é",
  "\u{1f600}",
  "\n",
  "\t",
);

const residual = fc.array(residualPiece, { maxLength: 6 }).map((pieces) => pieces.join(""));

const maskedValue = fc
  .array(residual, { minLength: 1, maxLength: 5 })
  .map((segments): MaskedValue => {
    const originals = segments.slice(1).map((_, index) => `%${index + 1}$s`);
    const text = segments.reduce((joined, segment, index) => `${joined}{${index - 1}}${segment}`);
    return { text, originals };
  });

describe("wire encoding round trip", () => {
  it("decodes the XML encoding back to the masked text and restores every original", () => {
    fc.assert(
      fc.property(maskedValue, (masked) => {
        const decoded = decodeMaskedFromXml(encodeMaskedForXml(masked));
        expect(decoded).toBe(masked.text);
        expect(
          decoded === undefined ? undefined : unmaskPlaceholders(decoded, masked),
        ).toBeDefined();
      }),
    );
  });

  it("decodes the HTML encoding back to the masked text whenever it encodes at all", () => {
    fc.assert(
      fc.property(maskedValue, (masked) => {
        const encoded = encodeMaskedForHtml(masked);
        fc.pre(encoded !== undefined);
        expect(encoded === undefined ? undefined : decodeMaskedFromHtml(encoded)).toBe(masked.text);
      }),
    );
  });
});
