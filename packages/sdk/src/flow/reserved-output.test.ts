import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { createOutputPathGuard, namesNoFile, type ReservedPath } from "./reserved-output.js";

const NO_RESERVED: ReadonlyMap<string, ReservedPath> = new Map();

describe("namesNoFile", () => {
  it.each(["", "   ", "out/", `out${sep}`])("is true for %j", (requested) => {
    expect(namesNoFile(requested)).toBe(true);
  });

  it.each(["out.tmx", "out/memory.tmx", "..exports/memory.tmx"])("is false for %j", (requested) => {
    expect(namesNoFile(requested)).toBe(false);
  });
});

describe("createOutputPathGuard", () => {
  it("checks only the path as written when the file-system port cannot resolve links", async () => {
    const { realpath: _realpath, ...withoutRealpath } = defaultFs;
    const guard = createOutputPathGuard(withoutRealpath, "/proj", NO_RESERVED);

    expect(await guard.refusal(join("/proj", "out.tmx"))).toBeUndefined();
    expect(await guard.canonical("/elsewhere/out.tmx")).toBe("/elsewhere/out.tmx");
  });

  it("falls back to the path as written when no ancestor resolves", async () => {
    const fs: SdkFs = {
      ...defaultFs,
      realpath: async () => {
        throw Object.assign(new Error("gone"), { code: "ENOENT" });
      },
    };
    const guard = createOutputPathGuard(fs, "/proj", NO_RESERVED);

    expect(await guard.refusal(join("/proj", "out", "memory.tmx"))).toBeUndefined();
    expect(await guard.canonical("/elsewhere/out.tmx")).toBe("/elsewhere/out.tmx");
  });

  it("canonicalizes the working directory and each reserved path once across calls", async () => {
    const resolved: string[] = [];
    const fs: SdkFs = {
      ...defaultFs,
      realpath: async (path) => {
        resolved.push(path);
        return path;
      },
    };
    const lock = join("/proj", "verbatra.lock.json");
    const reserved = new Map<string, ReservedPath>([
      [lock, { path: lock, kind: "lock-file", what: "the lock file" }],
    ]);
    const guard = createOutputPathGuard(fs, "/proj", reserved);

    expect(await guard.refusal(join("/proj", "a.csv"))).toBeUndefined();
    expect(await guard.refusal(join("/proj", "b.csv"))).toBeUndefined();

    expect(resolved.filter((path) => path === "/proj")).toHaveLength(1);
    expect(resolved.filter((path) => path === lock)).toHaveLength(1);
  });

  it("reports a reserved path reached through a link as linked", async () => {
    const lock = join("/proj", "verbatra.lock.json");
    const link = join("/proj", "out", "memory.tmx");
    const fs: SdkFs = {
      ...defaultFs,
      realpath: async (path) => (path === link ? lock : path),
    };
    const entry: ReservedPath = { path: lock, kind: "lock-file", what: "the lock file" };
    const guard = createOutputPathGuard(fs, "/proj", new Map([[lock, entry]]));

    expect(await guard.refusal(link)).toEqual({ kind: "reserved", reserved: entry, linked: true });
  });
});
