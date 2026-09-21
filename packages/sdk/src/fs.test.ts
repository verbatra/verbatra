import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, tempFileName } from "./fs.js";
import { makeTempDir } from "./test-support.js";

describe("tempFileName", () => {
  it("is unique for the same target across calls in immediate succession (same ms, same pid)", () => {
    const path = "/proj/locales/de.json";
    const names = new Set([tempFileName(path), tempFileName(path), tempFileName(path)]);
    expect(names.size).toBe(3);
  });

  it("places the temp as a hidden sibling in the target's own directory", () => {
    const path = "/proj/locales/de.json";
    const name = tempFileName(path);
    expect(dirname(name)).toBe(dirname(path));
    expect(basename(name).startsWith(".de.json.tmp-")).toBe(true);
  });
});

describe("defaultFs binary read/write", () => {
  it("readBytesBounded returns bytes below the cap, too-large above it, missing when absent", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "blob.bin");
    const data = new Uint8Array([0, 1, 2, 3, 255]);
    await writeFile(path, data);

    expect(await defaultFs.readBytesBounded(path, 2)).toEqual({ kind: "too-large" });
    const ok = await defaultFs.readBytesBounded(path, 100);
    expect(ok.kind).toBe("ok");
    if (ok.kind === "ok") {
      expect([...ok.bytes]).toEqual([0, 1, 2, 3, 255]);
    }
    expect(await defaultFs.readBytesBounded(join(dir, "absent.bin"), 100)).toEqual({
      kind: "missing",
    });
  });

  it("readBytesBounded reports a directory path as missing (not a regular file)", async () => {
    const dir = await makeTempDir();
    expect(await defaultFs.readBytesBounded(dir, 100)).toEqual({ kind: "missing" });
  });

  it("writeBytes writes atomically and round-trips", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "out.bin");
    const data = new Uint8Array([9, 8, 7]);
    await defaultFs.writeBytes(path, data);
    expect([...(await readFile(path))]).toEqual([9, 8, 7]);
  });
});

describe("defaultFs.createExclusive", () => {
  it("creates a missing parent directory, then the file, returning true", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "nested", "lock.json");
    const created = await defaultFs.createExclusive(path, "payload");
    expect(created).toBe(true);
    expect(await readFile(path, "utf8")).toBe("payload");
  });

  it("returns false and writes nothing when the file already exists", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "lock.json");
    expect(await defaultFs.createExclusive(path, "first")).toBe(true);
    expect(await defaultFs.createExclusive(path, "second")).toBe(false);
    expect(await readFile(path, "utf8")).toBe("first");
  });
});

describe("defaultFs.deleteFile", () => {
  it("deletes an existing file", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "lock.json");
    await defaultFs.createExclusive(path, "payload");
    await defaultFs.deleteFile(path);
    expect(await defaultFs.fileExists(path)).toBe(false);
  });

  it("is a no-op when the file is already absent", async () => {
    const dir = await makeTempDir();
    await expect(defaultFs.deleteFile(join(dir, "absent.json"))).resolves.toBeUndefined();
  });
});

describe("defaultFs.mkdir", () => {
  it("creates the directory and every missing parent, then writes into it", async () => {
    const dir = await makeTempDir();
    const target = join(dir, "handoff", "nested");
    await defaultFs.mkdir?.(target);
    await defaultFs.writeFile(join(target, "de.csv"), "Key");
    expect(await readFile(join(target, "de.csv"), "utf8")).toBe("Key");
  });

  it("is a no-op when the directory already exists", async () => {
    const dir = await makeTempDir();
    await defaultFs.mkdir?.(dir);
    await expect(defaultFs.mkdir?.(dir)).resolves.toBeUndefined();
  });
});

describe("defaultFs.readDirectory", () => {
  it("reports a file, a directory, and a symlink by kind", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "a.ts"), "");
    await mkdir(join(dir, "nested"));
    await symlink(join(dir, "a.ts"), join(dir, "link.ts"));

    const listed = (await defaultFs.readDirectory?.(dir)) ?? [];
    const entries = [...listed].sort((left, right) => left.name.localeCompare(right.name));

    expect(entries).toEqual([
      { name: "a.ts", kind: "file" },
      { name: "link.ts", kind: "other" },
      { name: "nested", kind: "directory" },
    ]);
  });

  it("rejects for a directory that does not exist", async () => {
    const dir = await makeTempDir();

    await expect(defaultFs.readDirectory?.(join(dir, "absent"))).rejects.toThrow();
  });
});
