import { describe, expect, it } from "vitest";
import { PAGE_IDS } from "../client/routes.js";
import { NAV_GROUPS } from "./nav-groups.js";

describe("NAV_GROUPS", () => {
  it("lists every page exactly once across the groups", () => {
    const listed = NAV_GROUPS.flatMap((group) => group.pages);
    expect([...listed].sort()).toEqual([...PAGE_IDS].sort());
  });

  it("names the Workspace and Project groups in that order", () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(["Workspace", "Project"]);
  });

  it("holds no empty group", () => {
    expect(NAV_GROUPS.every((group) => group.pages.length > 0)).toBe(true);
  });
});
