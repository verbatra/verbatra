import { describe, expect, it } from "vitest";
import { incompleteRun } from "./incomplete-run.js";

describe("incompleteRun", () => {
  it("counts failed and partial locales separately", () => {
    const locales = [
      { status: "failed" },
      { status: "partial" },
      { status: "partial" },
      { status: "succeeded" },
    ] as const;

    expect(incompleteRun(locales)).toEqual({ failed: 1, partial: 2 });
  });

  it("returns undefined when every locale finished cleanly", () => {
    expect(incompleteRun([{ status: "succeeded" }])).toBeUndefined();
    expect(incompleteRun([])).toBeUndefined();
  });
});
