import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decodeMaskedFromHtml,
  decodeMaskedFromXml,
  encodeMaskedForHtml,
  encodeMaskedForXml,
} from "./masked-wire-codec.js";
import { type MaskedValue, unmaskPlaceholders } from "./placeholder-protection.js";

const residualPiece = fc.constantFrom(
  "a",
  "Z",
  " ",
  "&",
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

const reservedCharacter = fc.constantFrom("<", ">", "{", "}");

const engineBracket = reservedCharacter.chain((character) => {
  const code = character.codePointAt(0) ?? 0;
  return fc.constantFrom(
    character,
    `&#${code};`,
    `&#x${code.toString(16)};`,
    `&#X${code.toString(16).toUpperCase()};`,
  );
});

function injectAt(encoded: string, at: number, injected: string): string {
  const position = at % (encoded.length + 1);
  return `${encoded.slice(0, position)}${injected}${encoded.slice(position)}`;
}

describe("engine-introduced brackets", () => {
  it("are rejected wherever they land in the XML output, raw or entity-encoded", () => {
    fc.assert(
      fc.property(maskedValue, fc.nat(), engineBracket, (masked, at, injected) => {
        expect(
          decodeMaskedFromXml(injectAt(encodeMaskedForXml(masked), at, injected)),
        ).toBeUndefined();
      }),
    );
  });

  it("are rejected wherever they land in the HTML output, raw or entity-encoded", () => {
    fc.assert(
      fc.property(maskedValue, fc.nat(), engineBracket, (masked, at, injected) => {
        const encoded = encodeMaskedForHtml(masked);
        fc.pre(encoded !== undefined);
        expect(
          encoded === undefined ? undefined : decodeMaskedFromHtml(injectAt(encoded, at, injected)),
        ).toBeUndefined();
      }),
    );
  });
});
