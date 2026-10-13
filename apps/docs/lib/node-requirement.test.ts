import { describe, expect, it } from "vitest";
import { nodeVersionsLabel } from "./node-requirement";
import { NODE_RANGE } from "./site";

describe("nodeVersionsLabel", () => {
  it("reads a caret and an open lower bound as minimum versions joined by the locale's or", () => {
    expect(nodeVersionsLabel("^22.18.0 || >=24", "en")).toBe("22.18+ or 24+");
    expect(nodeVersionsLabel("^22.18.0 || >=24", "de")).toBe("22.18+ oder 24+");
    expect(nodeVersionsLabel("^22.18.0 || >=24", "es")).toBe("22.18+ o 24+");
    expect(nodeVersionsLabel("^22.18.0 || >=24", "fr")).toBe("22.18+ ou 24+");
  });

  it("keeps a patch version and drops a zero minor", () => {
    expect(nodeVersionsLabel("^20.11.1", "en")).toBe("20.11.1+");
    expect(nodeVersionsLabel(">=24.0.0", "en")).toBe("24+");
  });

  it("refuses a comparator it cannot state plainly, so a new range shape fails the build", () => {
    expect(() => nodeVersionsLabel("~22.18.0", "en")).toThrow("~22.18.0");
  });

  it("labels the range the published packages declare", () => {
    expect(nodeVersionsLabel(NODE_RANGE, "en")).toMatch(/^\d[\d.]*\+( or \d[\d.]*\+)*$/);
  });
});
