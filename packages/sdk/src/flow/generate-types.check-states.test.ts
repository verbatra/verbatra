import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { DEFAULT_TYPES_PATH, generateTypes } from "./generate-types.js";

const CATALOG = '{\n  "title": "Verbatra",\n  "greeting": "Hello {{name}}"\n}\n';

async function seed(catalog = CATALOG): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"), { recursive: true });
  await writeFile(join(dir, "locales", "en.json"), catalog, "utf8");
  return dir;
}

async function generated(dir: string): Promise<string> {
  await generateTypes({ config: baseConfig(), cwd: dir });
  return readFile(join(dir, DEFAULT_TYPES_PATH), "utf8");
}

async function staleWith(dir: string, content: string): Promise<boolean> {
  await writeFile(join(dir, DEFAULT_TYPES_PATH), content, "utf8");
  const result = await generateTypes({ config: baseConfig(), cwd: dir, check: true });
  expect(result.written).toBe(false);
  expect(result.check).toBe(true);
  expect(await readFile(join(dir, DEFAULT_TYPES_PATH), "utf8")).toBe(content);
  return result.stale;
}

describe("check mode over every state the committed file can be in", () => {
  it("is not stale when the file is exactly what a fresh generation produces", async () => {
    const dir = await seed();
    const current = await generated(dir);

    expect(await staleWith(dir, current)).toBe(false);
  });

  it("is stale when the file is absent, and creates nothing", async () => {
    const dir = await seed();

    const result = await generateTypes({ config: baseConfig(), cwd: dir, check: true });

    expect(result.stale).toBe(true);
    expect(result.written).toBe(false);
    await expect(readFile(join(dir, DEFAULT_TYPES_PATH), "utf8")).rejects.toThrow();
  });

  it("is stale when the file is present but empty", async () => {
    const dir = await seed();
    await generated(dir);

    expect(await staleWith(dir, "")).toBe(true);
  });

  it("is stale when the file is present but not valid TypeScript", async () => {
    const dir = await seed();
    await generated(dir);

    expect(await staleWith(dir, "this is not typescript {{{ <<< )))\n")).toBe(true);
  });

  it("is stale when the file is valid TypeScript that declares something else entirely", async () => {
    const dir = await seed();
    await generated(dir);

    expect(await staleWith(dir, "export type VerbatraMessageKey = string;\n")).toBe(true);
  });

  it("is stale when the file differs only by trailing whitespace", async () => {
    const dir = await seed();
    const current = await generated(dir);

    expect(await staleWith(dir, `${current}  `)).toBe(true);
    expect(await staleWith(dir, current.replace(/;\n/g, "; \n"))).toBe(true);
  });

  it("is stale when the file differs only by its line endings", async () => {
    const dir = await seed();
    const current = await generated(dir);

    expect(current).not.toContain("\r\n");
    expect(await staleWith(dir, current.replace(/\n/g, "\r\n"))).toBe(true);
  });

  it("is stale when the file differs only by a leading byte-order mark", async () => {
    const dir = await seed();
    const current = await generated(dir);

    expect(await staleWith(dir, `﻿${current}`)).toBe(true);
  });

  it("is stale when the file loses only its final newline", async () => {
    const dir = await seed();
    const current = await generated(dir);

    expect(await staleWith(dir, current.replace(/\n$/, ""))).toBe(true);
  });

  it("a generating run over each of those states restores the exact bytes", async () => {
    const dir = await seed();
    const current = await generated(dir);

    for (const damaged of ["", "nonsense", `${current}  `, current.replace(/\n/g, "\r\n")]) {
      await writeFile(join(dir, DEFAULT_TYPES_PATH), damaged, "utf8");
      const result = await generateTypes({ config: baseConfig(), cwd: dir });

      expect(result.written).toBe(true);
      expect(await readFile(join(dir, DEFAULT_TYPES_PATH), "utf8")).toBe(current);
    }
  });
});

describe("round-trip stability", () => {
  it("writes byte-identical output on a second and third run over an unchanged catalog", async () => {
    const dir = await seed();
    const first = await generated(dir);
    const second = await generateTypes({ config: baseConfig(), cwd: dir });
    const third = await generateTypes({ config: baseConfig(), cwd: dir });

    expect(second).toMatchObject({ written: false, stale: false });
    expect(third).toMatchObject({ written: false, stale: false });
    expect(await readFile(join(dir, DEFAULT_TYPES_PATH), "utf8")).toBe(first);
  });

  it("produces the same bytes from the same catalog in two unrelated projects", async () => {
    const one = await seed();
    const two = await seed();

    expect(await generated(two)).toBe(await generated(one));
  });

  it("keeps document order for keys JavaScript object iteration would reorder", async () => {
    const dir = await seed('{\n  "10": "a",\n  "2": "b",\n  "banana": "c",\n  "1": "d"\n}\n');

    const declaration = await generated(dir);

    expect(declaration).toContain(
      [
        "export interface VerbatraMessages {",
        '  "10": VerbatraNoArguments;',
        '  "2": VerbatraNoArguments;',
        '  "banana": VerbatraNoArguments;',
        '  "1": VerbatraNoArguments;',
        "}",
      ].join("\n"),
    );
  });

  it("reorders the declaration only when the catalog itself reorders", async () => {
    const forward = await seed('{\n  "alpha": "a",\n  "beta": "b"\n}\n');
    const reversed = await seed('{\n  "beta": "b",\n  "alpha": "a"\n}\n');

    const one = await generated(forward);
    const other = await generated(reversed);

    expect(one).not.toBe(other);
    expect(one.indexOf('"alpha"')).toBeLessThan(one.indexOf('"beta"'));
    expect(other.indexOf('"beta"')).toBeLessThan(other.indexOf('"alpha"'));
  });

  it("does not depend on which order the same keys were generated in before", async () => {
    const dir = await seed('{\n  "alpha": "a",\n  "beta": "b"\n}\n');
    const forward = await generated(dir);

    await writeFile(join(dir, "locales", "en.json"), '{\n  "beta": "b",\n  "alpha": "a"\n}\n');
    await generateTypes({ config: baseConfig(), cwd: dir });
    await writeFile(join(dir, "locales", "en.json"), '{\n  "alpha": "a",\n  "beta": "b"\n}\n');
    await generateTypes({ config: baseConfig(), cwd: dir });

    expect(await readFile(join(dir, DEFAULT_TYPES_PATH), "utf8")).toBe(forward);
  });
});
