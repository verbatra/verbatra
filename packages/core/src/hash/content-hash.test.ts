import { describe, expect, it } from "vitest";
import { entry } from "../testing/factories.js";
import { contentHash } from "./content-hash.js";

const NFC = "caf\u00e9";
const NFD = "cafe\u0301";

describe("contentHash", () => {
  it("is equal for equal content", () => {
    expect(contentHash(entry({ key: "a" }))).toBe(contentHash(entry({ key: "a" })));
  });

  it("differs when the value differs", () => {
    const a = entry({ key: "a", value: "one" });
    const b = entry({ key: "a", value: "two" });
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it("does not depend on placeholder order", () => {
    const a = entry({ key: "a", placeholders: ["{x}", "{y}"] });
    const b = entry({ key: "a", placeholders: ["{y}", "{x}"] });
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it("differs when placeholder content differs (same length and order pattern)", () => {
    const a = entry({ key: "a", placeholders: ["{x}"] });
    const b = entry({ key: "a", placeholders: ["{y}"] });
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it("differs when the meaning differs", () => {
    const a = entry({ key: "a", value: "same", meaning: "button label" });
    const b = entry({ key: "a", value: "same", meaning: "menu item" });
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it("differs when isPlural differs", () => {
    const a = entry({ key: "a", value: "same", isPlural: false });
    const b = entry({ key: "a", value: "same", isPlural: true });
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it("ignores identity (key and namespace)", () => {
    const a = entry({ key: "a", namespace: "one", value: "same" });
    const b = entry({ key: "b", namespace: "two", value: "same" });
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it("reflects a context change (description)", () => {
    const a = entry({ key: "a", value: "same" });
    const b = entry({ key: "a", value: "same", description: "ctx" });
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it("is equal for Unicode-equivalent values (NFC vs NFD)", () => {
    expect(NFC).not.toBe(NFD);
    expect(contentHash(entry({ key: "a", value: NFC }))).toBe(
      contentHash(entry({ key: "a", value: NFD })),
    );
  });

  it("is equal regardless of line endings (CRLF, CR, LF)", () => {
    const lf = contentHash(entry({ key: "a", value: "a\nb" }));
    expect(contentHash(entry({ key: "a", value: "a\r\nb" }))).toBe(lf);
    expect(contentHash(entry({ key: "a", value: "a\rb" }))).toBe(lf);
  });

  it("normalizes context fields too (description NFC/NFD, meaning CRLF/LF)", () => {
    const a = entry({ key: "a", value: "v", description: NFD, meaning: "x\r\ny" });
    const b = entry({ key: "a", value: "v", description: NFC, meaning: "x\ny" });
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it("normalizes placeholders so Unicode-equivalent tokens agree", () => {
    const a = entry({ key: "a", placeholders: [`{${NFD}}`] });
    const b = entry({ key: "a", placeholders: [`{${NFC}}`] });
    expect(contentHash(a)).toBe(contentHash(b));
  });
});
