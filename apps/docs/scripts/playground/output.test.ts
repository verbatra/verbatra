import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playgroundOutputSchema } from "../../lib/playground/schema.ts";
import {
  type AtomicWriteOps,
  buildOutput,
  readExistingOutput,
  serializeOutput,
  writeAtomically,
} from "./output.ts";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "playground-output-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const input = {
  items: [
    { id: "welcome", text: "Welcome back, {name}!" },
    { id: "brand", text: "Verbatra", sameAllowed: true },
  ],
  languages: ["de"],
  translations: { de: { welcome: "Willkommen zurück, {name}!", brand: "Verbatra" } },
  sdkVersion: "0.12.0",
  generatedAt: new Date("2026-10-16T12:00:00.000Z"),
};

describe("buildOutput", () => {
  it("output has no extra fields: only items, translations and metadata", () => {
    const output = buildOutput(input);
    expect(Object.keys(output)).toEqual(["items", "translations", "metadata"]);
    expect(output.metadata).toEqual({
      sdkVersion: "0.12.0",
      provider: "gemini",
      model: "gemini-2.5-flash",
      generatedAt: "2026-10-16T12:00:00.000Z",
      temperature: "provider default",
    });
  });

  it("rejects the whole output when one value is invalid", () => {
    expect(() =>
      buildOutput({
        ...input,
        translations: { de: { welcome: "Willkommen!", brand: "Verbatra" } },
      }),
    ).toThrow(/placeholder \{name\}/);
  });

  it("the schema rejects an extra top-level field such as a request id", () => {
    const output = buildOutput(input);
    expect(playgroundOutputSchema.safeParse({ ...output, requestId: "abc" }).success).toBe(false);
  });
});

describe("writeAtomically", () => {
  it("writes via temp file and rename", async () => {
    const calls: string[] = [];
    const ops: AtomicWriteOps = {
      writeFile: async (path) => {
        calls.push(`write ${path}`);
      },
      rename: async (from, to) => {
        calls.push(`rename ${from} -> ${to}`);
      },
      remove: async (path) => {
        calls.push(`remove ${path}`);
      },
    };
    const target = join(directory, "translations.json");
    await writeAtomically(target, "{}", ops);
    expect(calls).toHaveLength(2);
    const temp = calls[0]?.slice("write ".length) ?? "";
    expect(temp.startsWith(join(directory, ".translations.json."))).toBe(true);
    expect(calls[1]).toBe(`rename ${temp} -> ${target}`);
  });

  it("replaces the file on disk and leaves no temp file behind", async () => {
    const target = join(directory, "translations.json");
    await writeFile(target, "old\n");
    await writeAtomically(target, "new\n");
    expect(await readFile(target, "utf8")).toBe("new\n");
    expect(await readdir(directory)).toEqual(["translations.json"]);
  });

  it("keeps the existing file and removes the temp file when the rename fails", async () => {
    const target = join(directory, "translations.json");
    await writeFile(target, "old\n");
    const remove = vi.fn(async (path: string) => rm(path, { force: true }));
    const ops: AtomicWriteOps = {
      writeFile: (path, data) => writeFile(path, data),
      rename: async () => {
        throw new Error("rename failed");
      },
      remove,
    };
    await expect(writeAtomically(target, "new\n", ops)).rejects.toThrow("rename failed");
    expect(await readFile(target, "utf8")).toBe("old\n");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(await readdir(directory)).toEqual(["translations.json"]);
  });
});

describe("readExistingOutput", () => {
  it("returns undefined when no output has been committed yet", async () => {
    expect(await readExistingOutput(join(directory, "missing.json"))).toBeUndefined();
  });

  it("parses the committed output through the schema", async () => {
    const target = join(directory, "translations.json");
    await writeFile(target, serializeOutput(buildOutput(input)));
    expect((await readExistingOutput(target))?.translations.de?.brand).toBe("Verbatra");
  });

  it("refuses a committed output that fails the schema", async () => {
    const target = join(directory, "translations.json");
    await writeFile(target, JSON.stringify({ items: [] }));
    await expect(readExistingOutput(target)).rejects.toThrow();
  });
});
