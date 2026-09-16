import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { baseConfig, makeTempDir, readTextFile } from "../test-support.js";
import { DEFAULT_TYPES_PATH, generateTypes } from "./generate-types.js";

const OLD_FIXED_CAP = 8 * 1024 * 1024;

interface Recorded {
  readonly fs: SdkFs;
  boundFor(path: string): number | undefined;
  readonly declarationBounds: number[];
}

function recordingFs(): Recorded {
  const reads: { path: string; maxBytes: number }[] = [];
  return {
    boundFor: (path) => reads.find((read) => read.path === path)?.maxBytes,
    get declarationBounds() {
      return reads
        .filter((read) => read.path.endsWith(DEFAULT_TYPES_PATH))
        .map((read) => read.maxBytes);
    },
    fs: {
      ...defaultFs,
      readFileBounded: async (path: string, maxBytes: number) => {
        reads.push({ path, maxBytes });
        return defaultFs.readFileBounded(path, maxBytes);
      },
    },
  };
}

async function seed(catalog: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"), { recursive: true });
  await writeFile(join(dir, "locales", "en.json"), JSON.stringify(catalog, null, 2), "utf8");
  return dir;
}

async function fresh(dir: string): Promise<string> {
  await generateTypes({ config: baseConfig(), cwd: dir });
  return readTextFile(join(dir, DEFAULT_TYPES_PATH));
}

async function checkWith(dir: string, content: string): Promise<boolean> {
  await writeFile(join(dir, DEFAULT_TYPES_PATH), content, "utf8");
  const result = await generateTypes({ config: baseConfig(), cwd: dir, check: true });
  expect(result.written).toBe(false);
  expect(await readTextFile(join(dir, DEFAULT_TYPES_PATH))).toBe(content);
  return result.stale;
}

describe("the read bound is the byte length of the declaration just built", () => {
  it("passes exactly that many bytes, not a fixed cap", async () => {
    const dir = await seed({ title: "Verbatra" });
    const recorded = recordingFs();

    await generateTypes({ config: baseConfig(), cwd: dir }, { fs: recorded.fs });
    const declaration = await readTextFile(join(dir, DEFAULT_TYPES_PATH));

    expect(recorded.boundFor(join(dir, DEFAULT_TYPES_PATH))).toBe(
      Buffer.byteLength(declaration, "utf8"),
    );
    expect(recorded.boundFor(join(dir, DEFAULT_TYPES_PATH))).not.toBe(OLD_FIXED_CAP);
  });

  it("counts UTF-8 bytes rather than UTF-16 code units", async () => {
    const dir = await seed({ "héllo\u{1F642}": "Verbatra" });
    const recorded = recordingFs();

    await generateTypes({ config: baseConfig(), cwd: dir }, { fs: recorded.fs });
    const declaration = await readTextFile(join(dir, DEFAULT_TYPES_PATH));

    expect(Buffer.byteLength(declaration, "utf8")).toBeGreaterThan(declaration.length);
    expect(recorded.boundFor(join(dir, DEFAULT_TYPES_PATH))).toBe(
      Buffer.byteLength(declaration, "utf8"),
    );
  });

  it("moves with the catalog, so two projects get two different bounds", async () => {
    const small = await seed({ a: "one" });
    const large = await seed(
      Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`key${index}`, "value"])),
    );
    const recorded = recordingFs();

    await generateTypes({ config: baseConfig(), cwd: small }, { fs: recorded.fs });
    await generateTypes({ config: baseConfig(), cwd: large }, { fs: recorded.fs });

    expect(recorded.declarationBounds).toHaveLength(2);
    expect(recorded.boundFor(join(small, DEFAULT_TYPES_PATH))).toBeLessThan(
      recorded.boundFor(join(large, DEFAULT_TYPES_PATH)) ?? 0,
    );
  });
});

describe("check mode across the read bound's edges", () => {
  it("is current when the file is exactly the fresh byte length and the fresh bytes", async () => {
    const dir = await seed({ title: "Verbatra", greeting: "Hello {{name}}" });
    const declaration = await fresh(dir);

    expect(await checkWith(dir, declaration)).toBe(false);
  });

  it("is stale when the file is one byte longer", async () => {
    const dir = await seed({ title: "Verbatra", greeting: "Hello {{name}}" });
    const declaration = await fresh(dir);
    const longer = `${declaration} `;

    expect(Buffer.byteLength(longer, "utf8")).toBe(Buffer.byteLength(declaration, "utf8") + 1);
    expect(await checkWith(dir, longer)).toBe(true);
  });

  it("is stale when the file is one byte shorter", async () => {
    const dir = await seed({ title: "Verbatra", greeting: "Hello {{name}}" });
    const declaration = await fresh(dir);
    const shorter = declaration.slice(0, -1);

    expect(Buffer.byteLength(shorter, "utf8")).toBe(Buffer.byteLength(declaration, "utf8") - 1);
    expect(await checkWith(dir, shorter)).toBe(true);
  });

  it("is stale when the file is empty", async () => {
    const dir = await seed({ title: "Verbatra", greeting: "Hello {{name}}" });
    await fresh(dir);

    expect(await checkWith(dir, "")).toBe(true);
  });

  it("is stale when the file is the right length but the wrong bytes", async () => {
    const dir = await seed({ title: "Verbatra", greeting: "Hello {{name}}" });
    const declaration = await fresh(dir);
    const swapped = `${declaration.slice(0, -2)}X\n`;

    expect(Buffer.byteLength(swapped, "utf8")).toBe(Buffer.byteLength(declaration, "utf8"));
    expect(await checkWith(dir, swapped)).toBe(true);
  });

  it("writes exactly the fresh bytes back over each of those states", async () => {
    const dir = await seed({ title: "Verbatra", greeting: "Hello {{name}}" });
    const declaration = await fresh(dir);

    for (const damaged of [`${declaration} `, declaration.slice(0, -1)]) {
      await writeFile(join(dir, DEFAULT_TYPES_PATH), damaged, "utf8");
      const result = await generateTypes({ config: baseConfig(), cwd: dir });

      expect(result.written).toBe(true);
      expect(await readTextFile(join(dir, DEFAULT_TYPES_PATH))).toBe(declaration);
    }
  });

  it("refuses to write over an empty file, which carries no generated header", async () => {
    const dir = await seed({ title: "Verbatra", greeting: "Hello {{name}}" });
    await fresh(dir);
    await writeFile(join(dir, DEFAULT_TYPES_PATH), "", "utf8");

    await expect(generateTypes({ config: baseConfig(), cwd: dir })).rejects.toMatchObject({
      code: "TYPES_OUTPUT_CONFLICT",
    });
    expect(await readTextFile(join(dir, DEFAULT_TYPES_PATH))).toBe("");
  });
});

describe("the permanently stale state a fixed read cap caused", () => {
  it("cannot happen for a declaration far past the old 8 MB cap", async () => {
    const dir = await seed(
      Object.fromEntries(
        Array.from({ length: 120_000 }, (_, index) => [
          `namespace.section.key${index}`,
          "Hello {{name}}",
        ]),
      ),
    );
    const declaration = await fresh(dir);

    expect(Buffer.byteLength(declaration, "utf8")).toBeGreaterThan(OLD_FIXED_CAP);

    const checked = await generateTypes({ config: baseConfig(), cwd: dir, check: true });
    const rerun = await generateTypes({ config: baseConfig(), cwd: dir });

    expect(checked).toMatchObject({ stale: false, written: false });
    expect(rerun).toMatchObject({ stale: false, written: false });
  }, 300_000);
});
