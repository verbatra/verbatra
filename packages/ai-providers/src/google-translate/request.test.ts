import { describe, expect, it } from "vitest";
import { buildTranslateNotices } from "./request.js";

describe("buildTranslateNotices", () => {
  it("returns no notices for a neutral tone and no glossary", () => {
    expect(buildTranslateNotices({ tone: "neutral", genericGlossarySupplied: false })).toEqual([]);
  });

  it("returns no notices when tone is absent and no glossary is supplied", () => {
    expect(buildTranslateNotices({ genericGlossarySupplied: false })).toEqual([]);
  });

  it.each(["formal", "informal"] as const)(
    "signals FORMALITY_DOWNGRADED for a non-neutral tone (%s), since v2 has no formality control",
    (tone) => {
      const notices = buildTranslateNotices({ tone, genericGlossarySupplied: false });
      expect(notices.map((n) => n.code)).toEqual(["FORMALITY_DOWNGRADED"]);
    },
  );

  it("signals GLOSSARY_IGNORED when a generic glossary term map is supplied", () => {
    const notices = buildTranslateNotices({ genericGlossarySupplied: true });
    expect(notices.map((n) => n.code)).toEqual(["GLOSSARY_IGNORED"]);
  });

  it("signals both notices together when both apply", () => {
    const notices = buildTranslateNotices({ tone: "formal", genericGlossarySupplied: true });
    expect(notices.map((n) => n.code).sort()).toEqual(["FORMALITY_DOWNGRADED", "GLOSSARY_IGNORED"]);
  });

  it("produces byte-identical messages regardless of call site (static, secret-free)", () => {
    const first = buildTranslateNotices({ tone: "formal", genericGlossarySupplied: false });
    const second = buildTranslateNotices({ tone: "informal", genericGlossarySupplied: false });
    expect(first[0]?.message).toBe(second[0]?.message);
  });
});
