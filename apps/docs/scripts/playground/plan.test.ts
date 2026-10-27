import { describe, expect, it } from "vitest";
import type { PlaygroundOutput } from "../../lib/playground/schema.ts";
import { estimateRequests, planPairs } from "./plan.ts";

const existing: PlaygroundOutput = {
  items: [
    { id: "save", text: "Save changes" },
    { id: "signIn", text: "Sign in" },
  ],
  translations: {
    de: { save: "Speichern", signIn: "Anmelden" },
  },
  metadata: {
    sdkVersion: "0.0.0-test",
    provider: "gemini",
    model: "gemini-2.5-flash",
    generatedAt: "2026-10-16T12:00:00.000Z",
    temperature: "provider default",
  },
};

describe("planPairs", () => {
  it("plans every pair without committed output", () => {
    const plan = planPairs([{ id: "save", text: "Save changes" }], ["de", "ja"], undefined);
    expect(plan.pairs).toEqual([
      { id: "save", language: "de", reason: "new" },
      { id: "save", language: "ja", reason: "new" },
    ]);
  });

  it("plans only missing and changed pairs", () => {
    const plan = planPairs(
      [
        { id: "save", text: "Save all changes" },
        { id: "signIn", text: "Sign in" },
        { id: "settings", text: "Settings" },
      ],
      ["de", "fr"],
      existing,
    );
    expect(plan.pairs).toEqual([
      { id: "save", language: "de", reason: "changed" },
      { id: "settings", language: "de", reason: "new" },
      { id: "save", language: "fr", reason: "changed" },
      { id: "signIn", language: "fr", reason: "new" },
      { id: "settings", language: "fr", reason: "new" },
    ]);
    expect(plan.kept).toEqual({ de: { signIn: "Anmelden" }, fr: {} });
  });

  it("replans an item whose sameAllowed flag changed", () => {
    const plan = planPairs(
      [{ id: "save", text: "Save changes", sameAllowed: true }],
      ["de"],
      existing,
    );
    expect(plan.pairs).toEqual([{ id: "save", language: "de", reason: "changed" }]);
  });
});

describe("planPairs: pinned model", () => {
  it("plans every pair as changed when the committed output came from another model", () => {
    const otherModel = {
      ...existing,
      metadata: { ...existing.metadata, model: "gemini-1.5-flash" },
    };
    const plan = planPairs(
      [
        { id: "save", text: "Save changes" },
        { id: "signIn", text: "Sign in" },
      ],
      ["de"],
      otherModel,
    );
    expect(plan.pairs).toEqual([
      { id: "save", language: "de", reason: "changed" },
      { id: "signIn", language: "de", reason: "changed" },
    ]);
    expect(plan.kept).toEqual({ de: {} });
  });
});

describe("estimateRequests", () => {
  it("counts one request per language batch of up to 50 pairs", () => {
    const plan = planPairs(
      Array.from({ length: 3 }, (_, index) => ({ id: `item${"abc"[index]}`, text: "Save" })),
      ["de", "ja"],
      undefined,
    );
    expect(estimateRequests(plan)).toBe(2);
    expect(estimateRequests({ pairs: [], kept: {} })).toBe(0);
  });
});
