import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async () => {
      throw Object.assign(new Error("EISDIR: illegal operation on a directory"), {
        code: "EISDIR",
      });
    },
  };
});

const { defaultFs } = await import("./fs.js");

describe("a platform that refuses to open a directory with EISDIR", () => {
  it("reports it as not a regular file, never as a permissions problem", async () => {
    const expected = { kind: "missing", unreadable: true, notRegularFile: true };

    expect(await defaultFs.readBytesBounded("/project/verbatra.limits.json", 100)).toEqual(
      expected,
    );
    expect(await defaultFs.readFileBounded("/project/verbatra.limits.json", 100)).toEqual(expected);
  });
});
