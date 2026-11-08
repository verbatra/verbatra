import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LIMITS_FILE_NAME,
  MAX_LIMITS_ENTRIES,
  MAX_LIMITS_FILE_BYTES,
  serializeLimits,
} from "../config/limits-file.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { withLimitsGuard, withLockFileGuard } from "../lock/locale-write-lock.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { setKeyLengthLimit } from "./set-key-length-limit.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

const SOURCE_KEYS = ["a", "b", "constructor", "__proto__", "toString"];

async function project(limits?: string | Buffer): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(
    join(dir, "locales", "en.json"),
    Object.fromEntries(SOURCE_KEYS.map((key) => [key, `Value of ${key}`])),
  );
  await writeJsonFile(join(dir, "locales", "de.json"), {});
  if (limits !== undefined) {
    await writeFile(join(dir, LIMITS_FILE_NAME), limits);
  }
  return dir;
}

async function limitsText(dir: string): Promise<string> {
  return readFile(join(dir, LIMITS_FILE_NAME), "utf8");
}

async function rejection(promise: Promise<unknown>): Promise<SdkError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(SdkError);
  return error as SdkError;
}

function document(maxLength: Record<string, number>): string {
  return `${JSON.stringify({ version: 1, maxLength }, null, 2)}\n`;
}

describe("setKeyLengthLimit: writing", () => {
  it("creates the file with the key, sorted, with a final newline", async () => {
    const dir = await project();

    const result = await setKeyLengthLimit({ config: cfg(), cwd: dir, key: "b", maxLength: 12 });

    expect(result).toEqual({ key: "b", maxLength: 12, changed: true });
    expect(await limitsText(dir)).toBe(document({ b: 12 }));
  });

  it("changes a limit and keeps the others in order", async () => {
    const dir = await project(document({ b: 3, a: 2 }));

    await setKeyLengthLimit({ config: cfg(), cwd: dir, key: "b", maxLength: 99 });

    expect(await limitsText(dir)).toBe(document({ a: 2, b: 99 }));
  });

  it("removes only the sidecar entry for null and leaves the config's limits alone", async () => {
    const dir = await project(document({ a: 2, b: 3 }));
    const config = cfg({ maxLength: { toString: 40 } });

    const result = await setKeyLengthLimit({ config, cwd: dir, key: "a", maxLength: null });

    expect(result).toEqual({ key: "a", maxLength: null, changed: true });
    expect(await limitsText(dir)).toBe(document({ b: 3 }));
    expect(config.maxLength).toEqual({ toString: 40 });
  });

  it("writes nothing when the file already holds exactly that", async () => {
    const dir = await project(document({ a: 2 }));
    const before = (await stat(join(dir, LIMITS_FILE_NAME))).mtimeMs;
    const writes: string[] = [];
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async (path, data) => {
        writes.push(path);
        await defaultFs.writeFile(path, data);
      },
    };

    const same = await setKeyLengthLimit(
      { config: cfg(), cwd: dir, key: "a", maxLength: 2 },
      { fs },
    );
    const absent = await setKeyLengthLimit(
      { config: cfg(), cwd: dir, key: "b", maxLength: null },
      { fs },
    );

    expect(same.changed).toBe(false);
    expect(absent.changed).toBe(false);
    expect(writes).toEqual([]);
    expect((await stat(join(dir, LIMITS_FILE_NAME))).mtimeMs).toBe(before);
  });

  it("reads and rewrites a file written with a BOM and CRLF line endings", async () => {
    const dir = await project(`﻿{\r\n  "version": 1,\r\n  "maxLength": {"a": 2}\r\n}\r\n`);

    await setKeyLengthLimit({ config: cfg(), cwd: dir, key: "b", maxLength: 5 });

    expect(await limitsText(dir)).toBe(document({ a: 2, b: 5 }));
  });

  it.each(["__proto__", "constructor", "toString"])(
    "sets, reads back and removes a limit for the key %s",
    async (key) => {
      const dir = await project();

      await setKeyLengthLimit({ config: cfg(), cwd: dir, key, maxLength: 8 });
      const text = await limitsText(dir);
      await setKeyLengthLimit({ config: cfg(), cwd: dir, key, maxLength: null });

      expect(Object.keys(JSON.parse(text).maxLength)).toEqual([key]);
      expect(JSON.parse(text).maxLength[key]).toBe(8);
      expect(await limitsText(dir)).toBe(document({}));
    },
  );

  it("accepts 2^53 - 1 as the largest limit", async () => {
    const dir = await project();

    await setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 2 ** 53 - 1 });

    expect(await limitsText(dir)).toBe(document({ a: 2 ** 53 - 1 }));
  });
});

describe("setKeyLengthLimit: refusing input", () => {
  it.each([
    ["0", 0],
    ["-1", -1],
    ["1.5", 1.5],
    ["NaN", Number.NaN],
    ['"5"', "5"],
    ["1e21", 1e21],
    ["2^53", 2 ** 53],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["undefined", undefined],
  ])("refuses the limit %s with LENGTH_LIMIT_INVALID and writes nothing", async (_label, value) => {
    const dir = await project();

    const error = await rejection(
      setKeyLengthLimit({
        config: cfg(),
        cwd: dir,
        key: "a",
        maxLength: value as unknown as number,
      }),
    );

    expect(error.code).toBe("LENGTH_LIMIT_INVALID");
    await expect(limitsText(dir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["an empty key", ""],
    ["a key of 1025 characters", "k".repeat(1025)],
    ["a key of 100,000 characters", "k".repeat(100_000)],
  ])("refuses %s with LENGTH_LIMIT_INVALID", async (_label, key) => {
    const dir = await project();

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key, maxLength: 5 }),
    );

    expect(error.code).toBe("LENGTH_LIMIT_INVALID");
  });

  it("refuses a key absent from the source with UNKNOWN_KEY", async () => {
    const dir = await project();

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "nope", maxLength: 5 }),
    );

    expect(error.code).toBe("UNKNOWN_KEY");
    await expect(limitsText(dir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses removing a key that is neither in the source nor in the file", async () => {
    const dir = await project(document({ a: 1 }));

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "nope", maxLength: null }),
    );

    expect(error.code).toBe("UNKNOWN_KEY");
  });

  it("removes the entry of a key that has left the source, so a stale entry can be cleaned up", async () => {
    const dir = await project(document({ a: 1, gone: 4 }));

    const result = await setKeyLengthLimit({
      config: cfg(),
      cwd: dir,
      key: "gone",
      maxLength: null,
    });

    expect(result.changed).toBe(true);
    expect(await limitsText(dir)).toBe(document({ a: 1 }));
  });

  it("refuses a limit for a key the config's maxLength sets", async () => {
    const dir = await project(document({ b: 1 }));
    const config = cfg({ maxLength: { a: 10 } });

    const error = await rejection(setKeyLengthLimit({ config, cwd: dir, key: "a", maxLength: 5 }));

    expect(error.code).toBe("LENGTH_LIMIT_INVALID");
    expect(error.message).toContain("config");
    expect(await limitsText(dir)).toBe(document({ b: 1 }));
  });

  it("removes the file's own entry for a key the config also sets, and leaves the config alone", async () => {
    const dir = await project(document({ a: 4, b: 1 }));
    const config = cfg({ maxLength: { a: 10 } });

    const result = await setKeyLengthLimit({ config, cwd: dir, key: "a", maxLength: null });

    expect(result).toEqual({ key: "a", maxLength: null, changed: true });
    expect(await limitsText(dir)).toBe(document({ b: 1 }));
    expect(config.maxLength).toEqual({ a: 10 });
  });

  it("removes a stale entry while the source file cannot be read", async () => {
    const dir = await project(document({ gone: 4, b: 1 }));
    await rm(join(dir, "locales", "en.json"));

    const result = await setKeyLengthLimit({
      config: cfg(),
      cwd: dir,
      key: "gone",
      maxLength: null,
    });

    expect(result.changed).toBe(true);
    expect(await limitsText(dir)).toBe(document({ b: 1 }));
  });

  it("still reports the unreadable source when null has nothing to remove", async () => {
    const dir = await project(document({ b: 1 }));
    await rm(join(dir, "locales", "en.json"));

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "gone", maxLength: null }),
    );

    expect(error.code).toBe("SOURCE_UNREADABLE");
  });

  it("still needs a readable source to set a limit", async () => {
    const dir = await project();
    await rm(join(dir, "locales", "en.json"));

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 5 }),
    );

    expect(error.code).toBe("SOURCE_UNREADABLE");
  });

  it("writes U+FFFD as an escape, not as raw bytes, so the file stays readable", async () => {
    const key = "a\uFFFDb";
    const dir = await project();
    await writeJsonFile(join(dir, "locales", "en.json"), { [key]: "Value", a: "A" });

    await setKeyLengthLimit({ config: cfg(), cwd: dir, key, maxLength: 9 });
    const text = await limitsText(dir);
    const next = await setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 3 });

    expect(text).not.toContain("\uFFFD");
    expect(next.changed).toBe(true);
    expect(JSON.parse(await limitsText(dir)).maxLength[key]).toBe(9);
  });

  it("refuses an invalid lock timeout before reading anything", async () => {
    const dir = await project();

    const error = await rejection(
      setKeyLengthLimit({
        config: cfg(),
        cwd: dir,
        key: "a",
        maxLength: 5,
        lockAcquireTimeoutMs: -1,
      }),
    );

    expect(error.code).toBe("LOCK_TIMEOUT_INVALID");
  });
});

describe("setKeyLengthLimit: an unusable limits file is never overwritten", () => {
  const manyEntries = (count: number): string =>
    JSON.stringify({
      version: 1,
      maxLength: Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, 5])),
    });

  it.each<[string, () => string | Buffer]>([
    ["not JSON", () => "{ nope"],
    ["a top-level array", () => "[]"],
    ["an unknown version", () => '{"version":2,"maxLength":{}}'],
    ["a wrong shape", () => '{"version":1,"maxLength":{"a":0}}'],
    ["non-UTF-8 bytes", () => Buffer.from([0x7b, 0xff, 0xfe, 0x7d])],
    ["10 MiB of text", () => "x".repeat(10 * 1024 * 1024)],
    ["50,000 entries", () => manyEntries(50_000)],
  ])(
    "refuses %s with LIMITS_FILE_UNUSABLE and leaves the bytes as they were",
    async (_label, make) => {
      const content = make();
      const dir = await project(content);

      const error = await rejection(
        setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 5 }),
      );

      expect(error.code).toBe("LIMITS_FILE_UNUSABLE");
      expect(error.message).not.toContain(dir);
      const after = await readFile(join(dir, LIMITS_FILE_NAME));
      expect(after.equals(Buffer.from(content))).toBe(true);
    },
  );

  it("refuses a directory at the path", async () => {
    const dir = await project();
    await mkdir(join(dir, LIMITS_FILE_NAME));

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 5 }),
    );

    expect(error.code).toBe("LIMITS_FILE_UNUSABLE");
  });
});

describe("setKeyLengthLimit: caps are checked before the write", () => {
  it("refuses an entry past the entry cap and writes nothing, yet still changes an existing one", async () => {
    const entries = {
      a: 5,
      ...Object.fromEntries(Array.from({ length: MAX_LIMITS_ENTRIES - 1 }, (_, i) => [`k${i}`, 5])),
    };
    const dir = await project(document(entries));
    const before = await limitsText(dir);

    const refused = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "b", maxLength: 5 }),
    );
    const afterRefusal = await limitsText(dir);
    const replaced = await setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 6 });

    expect(refused.code).toBe("LENGTH_LIMIT_INVALID");
    expect(afterRefusal).toBe(before);
    expect(replaced.changed).toBe(true);
    expect(JSON.parse(await limitsText(dir)).maxLength.a).toBe(6);
  });

  it("refuses a write that would push the file past the byte cap and writes nothing", async () => {
    const entries = new Map<string, number>();
    const fill = Math.floor((MAX_LIMITS_FILE_BYTES - 800) / 111);
    for (let i = 0; i < fill; i++) {
      entries.set(`${i}`.padStart(100, "k"), 5);
    }
    const size = Buffer.byteLength(serializeLimits(entries));
    expect(size).toBeLessThan(MAX_LIMITS_FILE_BYTES);
    expect(size).toBeGreaterThan(MAX_LIMITS_FILE_BYTES - 1_000);
    expect(entries.size).toBeLessThan(MAX_LIMITS_ENTRIES);
    const dir = await project(serializeLimits(entries));
    await writeJsonFile(
      join(dir, "locales", "en.json"),
      Object.fromEntries([["x".repeat(1024), "v"]]),
    );
    const before = await limitsText(dir);

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "x".repeat(1024), maxLength: 5 }),
    );

    expect(error.code).toBe("LENGTH_LIMIT_INVALID");
    expect(error.message).toContain("size");
    expect(await limitsText(dir)).toBe(before);
  });
});

describe("setKeyLengthLimit: failures of the file system", () => {
  it("maps a permission failure on the write to LIMITS_FILE_UNWRITABLE, naming the file relative to the project and a permissions remedy", async () => {
    const dir = await project();
    const cause = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async () => {
        throw cause;
      },
    };

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 5 }, { fs }),
    );

    expect(error).toMatchObject({ code: "LIMITS_FILE_UNWRITABLE", cause });
    expect(error.message).toBe(
      "Could not write the limits file verbatra.limits.json (EACCES). Check the write permissions on the containing directory, then run again.",
    );
    expect(error.message).not.toContain(dir);
  });

  it("maps a failed write to LIMITS_FILE_UNWRITABLE with the cause", async () => {
    const dir = await project();
    const cause = Object.assign(new Error("EROFS: read-only file system"), { code: "EROFS" });
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async () => {
        throw cause;
      },
    };

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 5 }, { fs }),
    );

    expect(error).toMatchObject({ code: "LIMITS_FILE_UNWRITABLE", cause });
  });

  it("maps a lock that cannot be created to LIMITS_FILE_UNWRITABLE with the cause", async () => {
    const dir = await project();
    const cause = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    const fs: SdkFs = {
      ...defaultFs,
      createExclusive: async () => {
        throw cause;
      },
    };

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 5 }, { fs }),
    );

    expect(error).toMatchObject({
      code: "LIMITS_FILE_UNWRITABLE",
      cause,
      message: expect.stringContaining("the limits write lock"),
    });
  });

  it("says the limit was saved when only the lock release fails", async () => {
    const dir = await project();
    const cause = Object.assign(new Error("EBUSY: resource busy"), { code: "EBUSY" });
    const fs: SdkFs = {
      ...defaultFs,
      deleteFile: async () => {
        throw cause;
      },
      rename: async () => {
        throw cause;
      },
    };

    const error = await rejection(
      setKeyLengthLimit({ config: cfg(), cwd: dir, key: "a", maxLength: 5 }, { fs }),
    );

    expect(error.code).toBe("LIMITS_FILE_UNWRITABLE");
    expect(error.message).toContain("The limit was saved, but the lock could not be released");
    expect(error.message).toContain(".verbatra-local/locks/_limits.lock");
    expect(error.message).not.toContain(dir);
    expect(await limitsText(dir)).toBe(document({ a: 5 }));
  });

  it("keeps a raw error from reading the file as it is", async () => {
    const dir = await project();
    const failure = Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async (path, maxBytes) => {
        if (path.endsWith(LIMITS_FILE_NAME)) {
          throw failure;
        }
        return defaultFs.readFileBounded(path, maxBytes);
      },
    };

    const error = await setKeyLengthLimit(
      { config: cfg(), cwd: dir, key: "a", maxLength: 5 },
      { fs },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBe(failure);
  });
});

describe("setKeyLengthLimit: the limits guard", () => {
  it("fails with LOCK_CONTENDED while another holder has the limits guard", async () => {
    const dir = await project();

    const error = await withLimitsGuard(dir, defaultFs, async () =>
      rejection(
        setKeyLengthLimit({
          config: cfg(),
          cwd: dir,
          key: "a",
          maxLength: 5,
          lockAcquireTimeoutMs: 100,
        }),
      ),
    );

    expect(error.code).toBe("LOCK_CONTENDED");
    await expect(limitsText(dir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("is not held up by the lock-file guard", async () => {
    const dir = await project();

    const result = await withLockFileGuard(dir, defaultFs, () =>
      setKeyLengthLimit({
        config: cfg(),
        cwd: dir,
        key: "a",
        maxLength: 5,
        lockAcquireTimeoutMs: 100,
      }),
    );

    expect(result.changed).toBe(true);
  });

  it("loses no update when many calls run at once in one process", async () => {
    const dir = await project();
    const keys = ["a", "b", "constructor", "__proto__", "toString"];

    await Promise.all(
      keys.map((key, index) =>
        setKeyLengthLimit({ config: cfg(), cwd: dir, key, maxLength: index + 1 }),
      ),
    );

    const written = JSON.parse(await limitsText(dir)).maxLength;
    expect(keys.map((key, index) => written[key] === index + 1)).toEqual(keys.map(() => true));
    expect(Object.keys(JSON.parse(await limitsText(dir)).maxLength).sort()).toEqual(
      [...keys].sort(),
    );
  });
});
