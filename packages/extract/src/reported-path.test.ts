import { describe, expect, it } from "vitest";
import { toReportedPath } from "./reported-path.js";

describe("toReportedPath", () => {
  it("reports a path below the working directory relative to it", () => {
    expect(toReportedPath("/project", "/project/src/nav.ts")).toBe("src/nav.ts");
  });

  it("reports a path outside the working directory as a parent traversal", () => {
    expect(toReportedPath("/project/app", "/project/lib/nav.ts")).toBe("../lib/nav.ts");
  });

  it("reports the working directory itself as the empty string", () => {
    expect(toReportedPath("/project", "/project")).toBe("");
  });

  it("normalises backslash separators to forward slashes", () => {
    expect(toReportedPath("/project", "/project/src\\panels\\nav.ts")).toBe("src/panels/nav.ts");
  });
});
