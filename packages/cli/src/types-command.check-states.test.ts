import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateTypes } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, recordingDeps } from "./test-support.js";

const TYPES_FILE = "verbatra-types.d.ts";

const CATALOG = '{\n  "title": "Verbatra",\n  "greeting": "Hello {{name}}"\n}\n';

async function project(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-cli-types-"));
  await mkdir(join(dir, "locales"), { recursive: true });
  await writeFile(join(dir, "locales", "en.json"), CATALOG, "utf8");
  return dir;
}

function realDeps(): ReturnType<typeof recordingDeps> {
  return recordingDeps({ generateTypes });
}

async function write(dir: string, content: string): Promise<void> {
  await writeFile(join(dir, TYPES_FILE), content, "utf8");
}

async function checkExit(dir: string): Promise<number> {
  const { deps } = realDeps();
  return run(["types", "--check", "--cwd", dir], deps, captureStreams().streams);
}

async function generate(dir: string): Promise<string> {
  const { deps } = realDeps();
  const code = await run(["types", "--cwd", dir], deps, captureStreams().streams);
  expect(code).toBe(0);
  return readFile(join(dir, TYPES_FILE), "utf8");
}

describe("verbatra types --check exit codes over real files", () => {
  it("exits 0 when the committed file is exactly current", async () => {
    const dir = await project();
    await generate(dir);

    expect(await checkExit(dir)).toBe(0);
  });

  it("exits 1 when the catalog has moved on since the file was written", async () => {
    const dir = await project();
    const before = await generate(dir);
    await writeFile(
      join(dir, "locales", "en.json"),
      '{\n  "title": "Verbatra",\n  "added": "x"\n}\n',
    );

    expect(await checkExit(dir)).toBe(1);
    expect(await readFile(join(dir, TYPES_FILE), "utf8")).toBe(before);
  });

  it("exits 1 when the file is absent, and does not create it", async () => {
    const dir = await project();

    expect(await checkExit(dir)).toBe(1);
    await expect(readFile(join(dir, TYPES_FILE), "utf8")).rejects.toThrow();
  });

  it("exits 1 when the file is present but empty", async () => {
    const dir = await project();
    await generate(dir);
    await write(dir, "");

    expect(await checkExit(dir)).toBe(1);
    expect(await readFile(join(dir, TYPES_FILE), "utf8")).toBe("");
  });

  it("exits 1 when the file is present but not valid TypeScript", async () => {
    const dir = await project();
    await generate(dir);
    await write(dir, "this is not typescript {{{ <<< )))\n");

    expect(await checkExit(dir)).toBe(1);
  });

  it("exits 1 when the file differs only by trailing whitespace", async () => {
    const dir = await project();
    const current = await generate(dir);
    await write(dir, `${current}  `);

    expect(await checkExit(dir)).toBe(1);
  });

  it("exits 1 when the file differs only by CRLF line endings", async () => {
    const dir = await project();
    const current = await generate(dir);
    await write(dir, current.replace(/\n/g, "\r\n"));

    expect(await checkExit(dir)).toBe(1);
  });

  it("exits 2, not 1, when the run cannot read the source catalog at all", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-cli-types-"));
    const { deps } = realDeps();
    const cap = captureStreams();

    const code = await run(["types", "--check", "--cwd", dir], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("SOURCE_UNREADABLE");
  });

  it("a plain run after any state that keeps the header leaves the file current again", async () => {
    const dir = await project();
    const current = await generate(dir);

    for (const damaged of [`${current} `, current.replace(/\n/g, "\r\n")]) {
      await write(dir, damaged);
      await generate(dir);

      expect(await readFile(join(dir, TYPES_FILE), "utf8")).toBe(current);
      expect(await checkExit(dir)).toBe(0);
    }
  });

  it("a plain run over a state that lost the header exits 2 and leaves the file untouched", async () => {
    const dir = await project();
    await generate(dir);

    for (const damaged of ["", "nonsense\n"]) {
      await write(dir, damaged);
      const { deps } = realDeps();
      const cap = captureStreams();

      const code = await run(["types", "--cwd", dir], deps, cap.streams);

      expect(code).toBe(2);
      expect(cap.err()).toContain("TYPES_OUTPUT_CONFLICT");
      expect(await readFile(join(dir, TYPES_FILE), "utf8")).toBe(damaged);
    }
  });
});
