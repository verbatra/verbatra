import { describe, expect, it } from "vitest";
import { applyValueReplaceParamsSchema, previewValueReplaceParamsSchema } from "./value-replace.js";

const ENTRY = { locale: "de", key: "greeting", valueHash: "abc" };

describe("applyValueReplaceParamsSchema", () => {
  it("accepts the criteria, the entries and both opt-ins", () => {
    expect(
      applyValueReplaceParamsSchema.safeParse({
        find: "a",
        replace: "b",
        entries: [ENTRY],
        includePinned: true,
        includeProtected: false,
      }).success,
    ).toBe(true);
  });

  it("refuses a client-sent actor field", () => {
    const parsed = applyValueReplaceParamsSchema.safeParse({
      find: "a",
      replace: "b",
      entries: [ENTRY],
      actor: "agent",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses an actor field inside an entry, an empty list and more than 1,000 entries", () => {
    const base = { find: "a", replace: "b" };
    expect(
      applyValueReplaceParamsSchema.safeParse({
        ...base,
        entries: [{ ...ENTRY, actor: "human" }],
      }).success,
    ).toBe(false);
    expect(applyValueReplaceParamsSchema.safeParse({ ...base, entries: [] }).success).toBe(false);
    expect(
      applyValueReplaceParamsSchema.safeParse({
        ...base,
        entries: Array.from({ length: 1001 }, (_, index) => ({ ...ENTRY, key: `k${index}` })),
      }).success,
    ).toBe(false);
  });
});

describe("previewValueReplaceParamsSchema", () => {
  it("refuses an actor field and an empty locale list", () => {
    expect(
      previewValueReplaceParamsSchema.safeParse({ find: "a", replace: "b", actor: "human" })
        .success,
    ).toBe(false);
    expect(
      previewValueReplaceParamsSchema.safeParse({ find: "a", replace: "b", locales: [] }).success,
    ).toBe(false);
    expect(
      previewValueReplaceParamsSchema.safeParse({ find: "a", replace: "b", locales: ["de"] })
        .success,
    ).toBe(true);
  });
});
