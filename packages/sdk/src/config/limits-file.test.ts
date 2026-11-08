import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs } from "../fs.js";
import { makeFakeFs, makeTempDir } from "../test-support.js";
import {
  LIMITS_FILE_NAME,
  limitsFilePath,
  MAX_LIMITS_ENTRIES,
  MAX_LIMITS_FILE_BYTES,
  MAX_LIMITS_KEY_LENGTH,
  parseLimitsContent,
  readLimitsFile,
  serializeLimits,
} from "./limits-file.js";

function document(maxLength: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, maxLength });
}

function reasonOf(content: string): string | undefined {
  const read = parseLimitsContent(content);
  return read.kind === "unusable" ? read.unusable.reason : undefined;
}

describe("parseLimitsContent", () => {
  it("reads a version 1 document into a map", () => {
    const read = parseLimitsContent(document({ "cart.title": 12, other: 5 }));

    expect(read).toEqual({
      kind: "ok",
      limits: new Map([
        ["cart.title", 12],
        ["other", 5],
      ]),
    });
  });

  it.each([
    ["0", 0],
    ["-1", -1],
    ["1.5", 1.5],
    ['"5"', "5"],
    ["null", null],
    ["true", true],
    ["an array", [5]],
    ["an object", { n: 5 }],
  ])("refuses the value %s as invalid", (_label, value) => {
    expect(reasonOf(document({ key: value }))).toBe("invalid");
  });

  it("refuses 1e21 and 2^53 (above Number.MAX_SAFE_INTEGER) and accepts 2^53 - 1", () => {
    expect(reasonOf('{"version":1,"maxLength":{"key":1e21}}')).toBe("invalid");
    expect(reasonOf(`{"version":1,"maxLength":{"key":${2 ** 53}}}`)).toBe("invalid");
    expect(reasonOf(`{"version":1,"maxLength":{"key":${2 ** 53 - 1}}}`)).toBeUndefined();
  });

  it("refuses NaN, which JSON cannot hold, as not JSON", () => {
    expect(reasonOf('{"version":1,"maxLength":{"key":NaN}}')).toBe("not-json");
  });

  it("refuses an empty key and a key over the key-length cap, accepts one at the cap", () => {
    expect(reasonOf(document({ "": 5 }))).toBe("invalid");
    expect(reasonOf(document({ ["k".repeat(MAX_LIMITS_KEY_LENGTH + 1)]: 5 }))).toBe("invalid");
    expect(reasonOf(document({ ["k".repeat(MAX_LIMITS_KEY_LENGTH)]: 5 }))).toBeUndefined();
    expect(reasonOf(document({ ["k".repeat(100_000)]: 5 }))).toBe("invalid");
  });

  it("refuses a top-level array, a missing field, an unknown field and a wrong version type", () => {
    expect(reasonOf("[]")).toBe("invalid");
    expect(reasonOf('{"version":1}')).toBe("invalid");
    expect(reasonOf('{"maxLength":{}}')).toBe("invalid");
    expect(reasonOf('{"version":1,"maxLength":{},"extra":1}')).toBe("invalid");
    expect(reasonOf('{"version":"1","maxLength":{}}')).toBe("invalid");
    expect(reasonOf('{"version":1,"maxLength":[]}')).toBe("invalid");
    expect(reasonOf('{"version":0,"maxLength":{}}')).toBe("invalid");
    expect(reasonOf("null")).toBe("invalid");
  });

  it("names a newer version as unsupported-version, not as invalid", () => {
    expect(reasonOf('{"version":2,"maxLength":{}}')).toBe("unsupported-version");
    expect(reasonOf('{"version":2,"somethingNew":true}')).toBe("unsupported-version");
  });

  it("refuses text that is not JSON, or not UTF-8", () => {
    expect(reasonOf("{")).toBe("not-json");
    expect(reasonOf("")).toBe("not-json");
    expect(reasonOf(`${document({})}�`)).toBe("not-utf8");
    expect(reasonOf(`${document({})}\u0000`)).toBe("not-utf8");
  });

  it("reads through a byte order mark and CRLF line endings", () => {
    const crlf = '{\r\n  "version": 1,\r\n  "maxLength": {\r\n    "a": 3\r\n  }\r\n}\r\n';

    expect(parseLimitsContent(`﻿${crlf}`)).toEqual({
      kind: "ok",
      limits: new Map([["a", 3]]),
    });
  });

  it("keeps the last of two duplicate keys, as JSON.parse does", () => {
    const read = parseLimitsContent('{"version":1,"maxLength":{"a":3,"a":9}}');

    expect(read).toEqual({ kind: "ok", limits: new Map([["a", 9]]) });
  });

  it("keeps the keys __proto__, constructor and toString as plain entries", () => {
    const content =
      '{"version":1,"maxLength":{"__proto__":4,"constructor":5,"toString":6,"hasOwnProperty":7}}';
    const read = parseLimitsContent(content);

    expect(read).toEqual({
      kind: "ok",
      limits: new Map([
        ["__proto__", 4],
        ["constructor", 5],
        ["toString", 6],
        ["hasOwnProperty", 7],
      ]),
    });
  });

  it("accepts exactly the entry cap and refuses one more, without reading further", () => {
    const at = Object.fromEntries(
      Array.from({ length: MAX_LIMITS_ENTRIES }, (_, i) => [`k${i}`, 5]),
    );
    const over = { ...at, extra: 5 };

    expect(reasonOf(document(at))).toBeUndefined();
    expect(reasonOf(document(over))).toBe("too-many-entries");
  });

  it("refuses 50,000 entries even though the file is under the byte cap", () => {
    const many = Object.fromEntries(Array.from({ length: 50_000 }, (_, i) => [`k${i}`, 5]));
    const content = document(many);

    expect(Buffer.byteLength(content)).toBeLessThan(MAX_LIMITS_FILE_BYTES);
    expect(reasonOf(content)).toBe("too-many-entries");
  });
});

describe("serializeLimits", () => {
  it("writes entries sorted, indented by two spaces, with a final newline", () => {
    const text = serializeLimits(
      new Map([
        ["b", 2],
        ["a", 1],
      ]),
    );

    expect(text).toBe('{\n  "version": 1,\n  "maxLength": {\n    "a": 1,\n    "b": 2\n  }\n}\n');
  });

  it("round-trips __proto__ as an own key", () => {
    const text = serializeLimits(new Map([["__proto__", 4]]));

    expect(text).toContain('"__proto__": 4');
    expect(parseLimitsContent(text)).toEqual({ kind: "ok", limits: new Map([["__proto__", 4]]) });
  });
});

describe("readLimitsFile", () => {
  it("treats a missing file as no limits", async () => {
    const dir = await makeTempDir();

    expect(await readLimitsFile(limitsFilePath(dir), defaultFs)).toEqual({
      kind: "ok",
      limits: new Map(),
    });
  });

  it("names the file beside the lock file", () => {
    expect(limitsFilePath("/project")).toBe(join("/project", LIMITS_FILE_NAME));
  });

  it("reports a file over the byte cap as too-large without parsing it", async () => {
    const dir = await makeTempDir();
    await writeFile(limitsFilePath(dir), "x".repeat(MAX_LIMITS_FILE_BYTES + 1));

    const read = await readLimitsFile(limitsFilePath(dir), defaultFs);

    expect(read).toMatchObject({ kind: "unusable", unusable: { reason: "too-large" } });
  });

  it("reports something that is not a regular file as unreadable, not as missing", async () => {
    const dir = await makeTempDir();
    await mkdir(limitsFilePath(dir));

    const read = await readLimitsFile(limitsFilePath(dir), defaultFs);

    expect(read).toMatchObject({ kind: "unusable", unusable: { reason: "unreadable" } });
  });

  it("follows a symbolic link to a regular file and reports a dangling one as no limits", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "real.json"), document({ a: 3 }));
    await symlink(join(dir, "real.json"), limitsFilePath(dir));

    expect(await readLimitsFile(limitsFilePath(dir), defaultFs)).toEqual({
      kind: "ok",
      limits: new Map([["a", 3]]),
    });

    const other = await makeTempDir();
    await symlink(join(other, "nowhere.json"), limitsFilePath(other));
    expect(await readLimitsFile(limitsFilePath(other), defaultFs)).toEqual({
      kind: "ok",
      limits: new Map(),
    });
  });

  it("decodes non-UTF-8 bytes into a not-utf8 verdict", async () => {
    const dir = await makeTempDir();
    await writeFile(limitsFilePath(dir), Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));

    const read = await readLimitsFile(limitsFilePath(dir), defaultFs);

    expect(read).toMatchObject({ kind: "unusable", unusable: { reason: "not-utf8" } });
  });

  it("never throws for any file state: the verdict carries the file's name, not its path", async () => {
    const fs = makeFakeFs({ readFileBounded: async () => ({ kind: "ok", content: "{" }) });

    const read = await readLimitsFile("/secret/place/verbatra.limits.json", fs);

    expect(read.kind === "unusable" && read.unusable.message).toBe(
      "verbatra.limits.json is not valid JSON",
    );
  });
});
