import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSourceFiles } from "./discovery.js";
import type { DirectoryEntry, SourceFs } from "./source-fs-port.js";

function fakeFs(tree: Readonly<Record<string, readonly DirectoryEntry[]>>): SourceFs {
  return {
    listDirectory: async (path) => tree[path] ?? [],
    readTextBounded: async () => ({ kind: "missing" }),
  };
}

const root = join("/", "project", "src");

describe("discoverSourceFiles", () => {
  it("returns matching files under a root, sorted, with absolute paths", async () => {
    const fs = fakeFs({
      [root]: [
        { name: "b.ts", kind: "file" },
        { name: "a.tsx", kind: "file" },
        { name: "notes.md", kind: "file" },
      ],
    });

    expect(await discoverSourceFiles({ roots: [root] }, fs)).toEqual([
      join(root, "a.tsx"),
      join(root, "b.ts"),
    ]);
  });

  it("descends into subdirectories", async () => {
    const nested = join(root, "app");
    const fs = fakeFs({
      [root]: [{ name: "app", kind: "directory" }],
      [nested]: [{ name: "page.ts", kind: "file" }],
    });

    expect(await discoverSourceFiles({ roots: [root] }, fs)).toEqual([join(nested, "page.ts")]);
  });

  it("never walks node_modules", async () => {
    const vendored = join(root, "node_modules");
    const fs = fakeFs({
      [root]: [{ name: "node_modules", kind: "directory" }],
      [vendored]: [{ name: "vendor.ts", kind: "file" }],
    });

    expect(await discoverSourceFiles({ roots: [root] }, fs)).toEqual([]);
  });

  it("skips a directory named by exclude", async () => {
    const generated = join(root, "generated");
    const fs = fakeFs({
      [root]: [{ name: "generated", kind: "directory" }],
      [generated]: [{ name: "schema.ts", kind: "file" }],
    });

    expect(await discoverSourceFiles({ roots: [root], exclude: ["generated"] }, fs)).toEqual([]);
  });

  it("skips an entry that is neither a file nor a directory, so a symlink cannot escape the root", async () => {
    const fs = fakeFs({
      [root]: [
        { name: "elsewhere", kind: "other" },
        { name: "real.ts", kind: "file" },
      ],
    });

    expect(await discoverSourceFiles({ roots: [root] }, fs)).toEqual([join(root, "real.ts")]);
  });

  it("reports an unreadable root as a diagnostic rather than failing the scan", async () => {
    const other = join("/", "project", "lib");
    const fs: SourceFs = {
      listDirectory: async (path) => {
        if (path === root) {
          throw new Error("ENOENT");
        }
        return path === other ? [{ name: "a.ts", kind: "file" }] : [];
      },
      readTextBounded: async () => ({ kind: "missing" }),
    };

    const unreadable: string[] = [];
    const files = await discoverSourceFiles(
      { roots: [root, other], onUnreadableDirectory: (path) => unreadable.push(path) },
      fs,
    );

    expect(files).toEqual([join(other, "a.ts")]);
    expect(unreadable).toEqual([root]);
  });

  it("yields each file once when two roots overlap", async () => {
    const fs = fakeFs({ [root]: [{ name: "a.ts", kind: "file" }] });

    expect(await discoverSourceFiles({ roots: [root, root] }, fs)).toEqual([join(root, "a.ts")]);
  });

  it("accepts every extension the first framework set covers", async () => {
    const names = ["a.ts", "b.tsx", "c.js", "d.jsx", "e.mjs", "f.cjs", "g.mts", "h.cts"];
    const fs = fakeFs({
      [root]: names.map((name) => ({ name, kind: "file" as const })),
    });

    expect(await discoverSourceFiles({ roots: [root] }, fs)).toHaveLength(names.length);
  });
});
