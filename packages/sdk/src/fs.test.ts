import { chmod, mkdir, readFile, stat, symlink, utimes, writeFile } from "node:fs/promises";
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

  it("readBytesBounded reports a directory path as missing and unreadable", async () => {
    const dir = await makeTempDir();
    expect(await defaultFs.readBytesBounded(dir, 100)).toEqual({
      kind: "missing",
      unreadable: true,
    });
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "readBytesBounded reports a file it may not open as missing and unreadable",
    async () => {
      const dir = await makeTempDir();
      const path = join(dir, "locked.bin");
      await writeFile(path, new Uint8Array([1]));
      await chmod(path, 0o000);

      expect(await defaultFs.readBytesBounded(path, 100)).toEqual({
        kind: "missing",
        unreadable: true,
      });
    },
  );
});

describe("defaultFs bounded text read: why a file is missing", () => {
  it("reports an absent path as missing with no unreadable flag", async () => {
    const dir = await makeTempDir();
    expect(await defaultFs.readFileBounded(join(dir, "absent.json"), 100)).toEqual({
      kind: "missing",
    });
  });

  it("reports a path below a regular file as missing with no unreadable flag", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "file.json");
    await writeFile(path, "{}", "utf8");
    expect(await defaultFs.readFileBounded(join(path, "child.json"), 100)).toEqual({
      kind: "missing",
    });
  });

  it("reports a directory path as missing and unreadable", async () => {
    const dir = await makeTempDir();
    expect(await defaultFs.readFileBounded(dir, 100)).toEqual({
      kind: "missing",
      unreadable: true,
    });
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports a file it may not open as missing and unreadable",
    async () => {
      const dir = await makeTempDir();
      const path = join(dir, "locked.json");
      await writeFile(path, "{}", "utf8");
      await chmod(path, 0o000);

      expect(await defaultFs.readFileBounded(path, 100)).toEqual({
        kind: "missing",
        unreadable: true,
      });
    },
  );

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

describe("defaultFs.rename", () => {
  it("moves a file to a new name in the same directory", async () => {
    const dir = await makeTempDir();
    const from = join(dir, "de.lock");
    const to = join(dir, "de.lock.aside");
    await writeFile(from, "held", "utf8");

    await defaultFs.rename?.(from, to);

    expect(await defaultFs.fileExists(from)).toBe(false);
    expect(await readFile(to, "utf8")).toBe("held");
  });

  it("replaces a file already at the destination", async () => {
    const dir = await makeTempDir();
    const from = join(dir, "a");
    const to = join(dir, "b");
    await writeFile(from, "new", "utf8");
    await writeFile(to, "old", "utf8");

    await defaultFs.rename?.(from, to);

    expect(await readFile(to, "utf8")).toBe("new");
  });

  it("rejects with ENOENT when nothing is at the source", async () => {
    const dir = await makeTempDir();

    await expect(defaultFs.rename?.(join(dir, "gone"), join(dir, "b"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("defaultFs.touch and defaultFs.mtimeMs", () => {
  it("reports a file's modification time and moves it to now on touch", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "de.lock");
    await writeFile(path, "held", "utf8");
    const old = new Date(Date.now() - 60_000);
    await utimes(path, old, old);

    expect(await defaultFs.mtimeMs?.(path)).toBe((await stat(path)).mtimeMs);
    const before = Date.now();
    await defaultFs.touch?.(path);

    expect(await defaultFs.mtimeMs?.(path)).toBeGreaterThanOrEqual(before - 1_000);
    expect(await readFile(path, "utf8")).toBe("held");
  });

  it("reports no modification time for a missing file", async () => {
    const dir = await makeTempDir();

    expect(await defaultFs.mtimeMs?.(join(dir, "gone"))).toBeUndefined();
  });

  it("rejects a stat failure that is not a missing file", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "file");
    await writeFile(file, "", "utf8");

    await expect(defaultFs.mtimeMs?.(join(file, "child"))).rejects.toMatchObject({
      code: "ENOTDIR",
    });
  });

  it("rejects touching a missing file", async () => {
    const dir = await makeTempDir();

    await expect(defaultFs.touch?.(join(dir, "gone"))).rejects.toMatchObject({ code: "ENOENT" });
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
