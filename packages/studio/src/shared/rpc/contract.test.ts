import { describe, expect, it } from "vitest";
import { RPC_METHOD_NAMES, rpcParamsSchemas } from "./contract.js";

const EXPECTED_METHOD_NAMES = [
  "project.snapshot",
  "status.check",
  "status.diff",
  "glossary.get",
  "glossary.write",
  "lock.state",
  "history.list",
  "key.integrity",
  "translation.retranslateEntry",
  "review.queue",
  "translation.editEntry",
  "key.value",
  "key.context",
  "locale.values",
  "locale.integrity",
  "translation.estimate",
  "translation.translatePending",
  "usage.summary",
  "review.approve",
  "review.reject",
  "review.approveMany",
  "review.rejectMany",
  "translation.retranslateEntries",
];

describe("RPC_METHOD_NAMES", () => {
  it("contains exactly the twenty-three agreed method names, no more, no fewer", () => {
    expect(new Set(RPC_METHOD_NAMES)).toEqual(new Set(EXPECTED_METHOD_NAMES));
    expect(RPC_METHOD_NAMES).toHaveLength(EXPECTED_METHOD_NAMES.length);
  });
});

describe("rpcParamsSchemas", () => {
  it("has the same keys as RPC_METHOD_NAMES, same set, same length", () => {
    const schemaKeys = Object.keys(rpcParamsSchemas);
    expect(new Set(schemaKeys)).toEqual(new Set(RPC_METHOD_NAMES));
    expect(schemaKeys).toHaveLength(RPC_METHOD_NAMES.length);
  });

  it.each([
    ["project.snapshot", {}, { extra: true }],
    ["status.check", {}, { locales: [] }],
    ["status.diff", { locales: ["de"] }, { locales: [] }],
    ["glossary.get", {}, { extra: true }],
    [
      "glossary.write",
      { term: "Verbatra", translation: "Verbatra" },
      { term: "Verbatra", translation: "" },
    ],
    ["lock.state", {}, { extra: true }],
    ["history.list", { limit: 5 }, { limit: 0 }],
    ["key.integrity", { key: "greeting" }, { key: "" }],
    [
      "translation.retranslateEntry",
      { locale: "de", key: "greeting" },
      { locale: "", key: "greeting" },
    ],
    ["review.queue", {}, { extra: true }],
    [
      "translation.editEntry",
      { locale: "de", key: "greeting", value: "Hallo" },
      { locale: "de", key: "greeting" },
    ],
    ["key.value", { locale: "de", key: "greeting" }, { locale: "", key: "greeting" }],
    ["locale.values", {}, { extra: true }],
    ["key.context", { locale: "de", key: "greeting" }, { locale: "de" }],
    ["locale.integrity", { locales: ["de"] }, { locales: [] }],
    ["translation.estimate", { locales: ["de"] }, { locales: [] }],
    ["translation.translatePending", {}, { locale: "de" }],
    ["translation.translatePending", { locales: ["de"], maxTokens: 500 }, { maxTokens: 0 }],
    ["usage.summary", {}, { extra: true }],
    [
      "review.approve",
      { locale: "de", key: "greeting", expectedValue: "Hallo" },
      { locale: "de", key: "greeting", expectedValue: "Hallo", reviewer: "mk" },
    ],
    [
      "review.reject",
      { locale: "de", key: "greeting", expectedValue: "" },
      { locale: "de", key: "greeting" },
    ],
    [
      "review.approveMany",
      { entries: [{ locale: "de", key: "greeting", expectedValue: "Hallo" }] },
      { entries: [] },
    ],
    [
      "review.rejectMany",
      { entries: [{ locale: "de", key: "greeting", expectedValue: "" }] },
      { entries: [{ locale: "de", key: "greeting" }] },
    ],
    [
      "translation.retranslateEntries",
      { entries: [{ locale: "de", key: "greeting" }] },
      { entries: [{ locale: "de", key: "greeting" }], includeHuman: true },
    ],
  ] as const)("%s accepts a valid shape and rejects an invalid shape", (method, valid, invalid) => {
    const schema = rpcParamsSchemas[method];
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
  });

  it('declares no field capable of expressing "enable spend" or "enable write" on any method, read or write', () => {
    for (const method of RPC_METHOD_NAMES) {
      const shapeKeys = Object.keys(rpcParamsSchemas[method].shape);
      expect(shapeKeys).not.toContain("spend");
      expect(shapeKeys).not.toContain("writeToDisk");
    }
  });

  it("rejects a body that smuggles a spend or writeToDisk field alongside otherwise-valid params", () => {
    const result = rpcParamsSchemas["translation.retranslateEntry"].safeParse({
      locale: "de",
      key: "greeting",
      spend: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a glossary.write body that names a file path, the only way a client could pick a target", () => {
    for (const smuggled of [
      { path: "../../etc/passwd" },
      { file: "glossary.json" },
      { cwd: "/tmp" },
    ]) {
      const result = rpcParamsSchemas["glossary.write"].safeParse({
        term: "Verbatra",
        translation: "Verbatra",
        ...smuggled,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects a translation.editEntry body that smuggles a writeToDisk field", () => {
    const result = rpcParamsSchemas["translation.editEntry"].safeParse({
      locale: "de",
      key: "greeting",
      value: "Hallo",
      writeToDisk: true,
    });
    expect(result.success).toBe(false);
  });

  it("caps a review batch at 100 entries and a retranslate batch at 20", () => {
    const review = (count: number) => ({
      entries: Array.from({ length: count }, (_, index) => ({
        locale: "de",
        key: `k${index}`,
        expectedValue: "v",
      })),
    });
    const retranslate = (count: number) => ({
      entries: Array.from({ length: count }, (_, index) => ({ locale: "de", key: `k${index}` })),
    });

    expect(rpcParamsSchemas["review.approveMany"].safeParse(review(100)).success).toBe(true);
    expect(rpcParamsSchemas["review.approveMany"].safeParse(review(101)).success).toBe(false);
    expect(
      rpcParamsSchemas["translation.retranslateEntries"].safeParse(retranslate(20)).success,
    ).toBe(true);
    expect(
      rpcParamsSchemas["translation.retranslateEntries"].safeParse(retranslate(21)).success,
    ).toBe(false);
  });
});
