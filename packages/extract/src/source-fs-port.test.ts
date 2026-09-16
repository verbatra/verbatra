import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeSourceFs } from "./source-fs-port.js";

const created: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "verbatra-source-fs-"));
  created.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("nodeSourceFs.listDirectory", () => {
  it("reports a file, a directory, and a symlink by kind", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "a.ts"), "");
    await mkdir(join(root, "nested"));
    await symlink(join(root, "a.ts"), join(root, "link.ts"));

    const entries = [...(await nodeSourceFs.listDirectory(root))].sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    expect(entries).toEqual([
      { name: "a.ts", kind: "file" },
      { name: "link.ts", kind: "other" },
      { name: "nested", kind: "directory" },
    ]);
  });

  it("rejects for a directory that does not exist", async () => {
    const root = await tempRoot();

    await expect(nodeSourceFs.listDirectory(join(root, "absent"))).rejects.toThrow();
  });
});

describe("nodeSourceFs.readTextBounded", () => {
  it("reads a file in full", async () => {
    const root = await tempRoot();
    const path = join(root, "a.ts");
    await writeFile(path, 't("greeting");');

    expect(await nodeSourceFs.readTextBounded(path, 1024)).toEqual({
      kind: "ok",
      content: 't("greeting");',
    });
  });

  it("reports a missing file rather than throwing", async () => {
    const root = await tempRoot();

    expect(await nodeSourceFs.readTextBounded(join(root, "absent.ts"), 1024)).toEqual({
      kind: "missing",
    });
  });

  it("reports a directory as missing rather than reading it", async () => {
    const root = await tempRoot();

    expect(await nodeSourceFs.readTextBounded(root, 1024)).toEqual({ kind: "missing" });
  });

  it("refuses to read past the byte limit", async () => {
    const root = await tempRoot();
    const path = join(root, "big.ts");
    await writeFile(path, "x".repeat(64));

    expect(await nodeSourceFs.readTextBounded(path, 16)).toEqual({ kind: "too-large" });
  });
});
