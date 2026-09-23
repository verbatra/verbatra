import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { canonicalOutputConflict, namesNoFile, type ReservedPath } from "./reserved-output.js";

const NO_RESERVED: ReadonlyMap<string, ReservedPath> = new Map();

describe("namesNoFile", () => {
  it.each(["", "   ", "out/", `out${sep}`])("is true for %j", (requested) => {
    expect(namesNoFile(requested)).toBe(true);
  });

  it.each(["out.tmx", "out/memory.tmx", "..exports/memory.tmx"])("is false for %j", (requested) => {
    expect(namesNoFile(requested)).toBe(false);
  });
});

describe("canonicalOutputConflict", () => {
  it("reports nothing when the file-system port cannot resolve links", async () => {
    const { realpath: _realpath, ...withoutRealpath } = defaultFs;

    expect(
      await canonicalOutputConflict(withoutRealpath, "/proj", "/elsewhere/out.tmx", NO_RESERVED),
    ).toBeUndefined();
  });

  it("falls back to the path as written when no ancestor resolves", async () => {
    const fs: SdkFs = {
      ...defaultFs,
      realpath: async () => {
        throw Object.assign(new Error("gone"), { code: "ENOENT" });
      },
    };

    expect(
      await canonicalOutputConflict(fs, "/proj", join("/proj", "out", "memory.tmx"), NO_RESERVED),
    ).toBeUndefined();
    expect(await canonicalOutputConflict(fs, "/proj", "/elsewhere/out.tmx", NO_RESERVED)).toEqual({
      kind: "outside-working-directory",
    });
  });
});
