import { describe, expect, it } from "vitest";
import { assessBidiControls } from "./bidi-controls.js";

const LRE = "\u202a";
const RLE = "\u202b";
const PDF = "\u202c";
const LRO = "\u202d";
const RLO = "\u202e";
const LRI = "\u2066";
const RLI = "\u2067";
const FSI = "\u2068";
const PDI = "\u2069";
const LRM = "\u200e";
const RLM = "\u200f";
const ALM = "\u061c";

describe("assessBidiControls: balanced values", () => {
  it.each([
    ["an empty string", ""],
    ["plain text", "Hello there"],
    ["marks only", `${RLM}مرحبا${LRM} ${ALM}123`],
    ["a closed embedding", `a ${LRE}b${PDF} c ${RLE}d${PDF}`],
    ["a closed override", `${RLO}reversed${PDF}`],
    ["closed isolates of every kind", `${LRI}a${PDI} ${RLI}b${PDI} ${FSI}c${PDI}`],
    ["nested isolates", `${RLI}a ${LRI}b${PDI} c${PDI}`],
    ["an embedding inside an isolate, closed by its PDF", `${RLI}${LRE}a${PDF}${PDI}`],
    ["an embedding inside an isolate, closed by the PDI", `${RLI}a ${LRE}b ${RLO}c${PDI}`],
    ["an isolate inside an embedding", `${RLE}a ${LRI}b${PDI}${PDF}`],
    ["closed controls on each line", `${RLI}a${PDI}\n${LRE}b${PDF}`],
    ["a PDF inside an isolate, which it cannot close", `${RLI}a${PDF}${PDI}`],
    [
      "a PDF inside an isolate that sits in an embedding the PDF cannot reach",
      `${RLE}${LRI}a${PDF}${PDI}${PDF}`,
    ],
    [
      "embeddings past the maximum depth of 125, closed in order",
      `${RLE.repeat(130)}${RLI}a${PDF}${PDI}${PDF.repeat(130)}`,
    ],
  ])("accepts %s", (_name, value) => {
    expect(assessBidiControls(value).balanced).toBe(true);
  });
});

describe("assessBidiControls: unbalanced values", () => {
  it.each([
    ["an unclosed embedding", `${RLE}text`],
    ["an unclosed override", `${LRO}text`],
    ["an unclosed isolate", `${RLI}مرحبا {name}`],
    ["a stray PDF", `text${PDF}`],
    ["a stray PDI", `text${PDI}`],
    ["a PDI closing an isolate twice", `${RLI}a${PDI}${PDI}`],
    ["an isolate opened on one line and closed on the next", `${RLI}a\n${PDI}`],
    ["an embedding left open at a paragraph separator", `${RLE}a\u2029b`],
    ["an embedding left open at a carriage return", `${LRE}a\rb`],
  ])("rejects %s", (_name, value) => {
    expect(assessBidiControls(value).balanced).toBe(false);
  });
});

describe("assessBidiControls: overrides", () => {
  it("counts each left-to-right and right-to-left override", () => {
    expect(assessBidiControls(`${LRO}a${PDF} ${RLO}b${PDF} ${RLO}c${PDF}`)).toEqual({
      balanced: true,
      leftOverrides: 1,
      rightOverrides: 2,
    });
  });

  it("counts no override for embeddings, isolates or marks", () => {
    expect(assessBidiControls(`${LRE}a${PDF}${RLI}b${PDI}${RLM}`)).toEqual({
      balanced: true,
      leftOverrides: 0,
      rightOverrides: 0,
    });
  });

  it("still counts overrides in an unbalanced value", () => {
    expect(assessBidiControls(`${RLO}a${PDI}`)).toEqual({
      balanced: false,
      leftOverrides: 0,
      rightOverrides: 1,
    });
  });
});
