import { chmod, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { makeTempDir, readTextFile } from "../test-support.js";
import { updateGlossaryTerm } from "./glossary-file.js";

const ORIGINAL = '{\n  "brand": "Verbatra"\n}\n';

const lockedDirectories: string[] = [];

afterEach(async () => {
  for (const directory of lockedDirectories.splice(0)) {
    await chmod(directory, 0o700);
  }
});

async function seed(): Promise<{ cwd: string; path: string }> {
  const cwd = await makeTempDir();
  const path = join(cwd, "glossary.json");
  await writeFile(path, ORIGINAL, "utf8");
  return { cwd, path };
}

function edit(cwd: string, path: string, fs?: SdkFs): Promise<unknown> {
  return updateGlossaryTerm(
    { glossary: { source: "file", path }, cwd, term: "cli", translation: "CLI" },
    fs === undefined ? {} : { fs },
  );
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

const permissionDenied = (): NodeJS.ErrnoException =>
  Object.assign(new Error("EACCES: permission denied, mkdir '.verbatra-local'"), {
    code: "EACCES",
  });

const runsAsRoot = typeof process.getuid === "function" && process.getuid() === 0;

describe("updateGlossaryTerm: a project where the glossary lock cannot be created", () => {
  it("maps a lock directory that cannot be created to GLOSSARY_UNWRITABLE with the cause", async () => {
    const { cwd, path } = await seed();
    const cause = permissionDenied();
    const fs: SdkFs = {
      ...defaultFs,
      createExclusive: async () => {
        throw cause;
      },
    };

    const error = await rejection(edit(cwd, path, fs));

    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({
      code: "GLOSSARY_UNWRITABLE",
      message: expect.stringMatching(
        /^Could not write the glossary write lock \.verbatra-local\/.+ \(EACCES\)\. Check the write permissions/,
      ),
      cause,
    });
    expect(await readTextFile(path)).toBe(ORIGINAL);
  });

  it("keeps LOCK_CONTENDED and other structured lock failures as they are", async () => {
    const { cwd, path } = await seed();
    const contended = new SdkError("LOCK_CONTENDED", "held elsewhere");
    const fs: SdkFs = {
      ...defaultFs,
      createExclusive: async () => {
        throw contended;
      },
    };

    expect(await rejection(edit(cwd, path, fs))).toBe(contended);
  });

  it("does not relabel a failure after the lock is held as a lock failure", async () => {
    const { cwd, path } = await seed();
    const readFailure = Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async () => {
        throw readFailure;
      },
    };

    expect(await rejection(edit(cwd, path, fs))).toBe(readFailure);
  });

  it("carries the file-system error as the cause of a failed glossary write", async () => {
    const { cwd, path } = await seed();
    const cause = Object.assign(new Error("EROFS: read-only file system"), { code: "EROFS" });
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async () => {
        throw cause;
      },
    };

    expect(await rejection(edit(cwd, path, fs))).toMatchObject({
      code: "GLOSSARY_UNWRITABLE",
      cause,
    });
  });

  it.skipIf(runsAsRoot)(
    "reports GLOSSARY_UNWRITABLE rather than a raw EACCES in a read-only project (skipped as root, where chmod does not deny writes)",
    async () => {
      const { cwd, path } = await seed();
      await chmod(cwd, 0o500);
      lockedDirectories.push(cwd);

      const error = await rejection(edit(cwd, path));

      expect(error).toBeInstanceOf(SdkError);
      expect(error).toMatchObject({
        code: "GLOSSARY_UNWRITABLE",
        cause: { code: expect.stringMatching(/^(EACCES|EPERM)$/) },
      });
      expect(await readdir(cwd)).toEqual(["glossary.json"]);
      expect(await readTextFile(path)).toBe(ORIGINAL);
    },
  );
});

describe("updateGlossaryTerm: a glossary lock that cannot be released", () => {
  const releaseFailure = (): NodeJS.ErrnoException =>
    Object.assign(new Error("EPERM: operation not permitted, unlink"), { code: "EPERM" });

  it("maps a failed release after a saved edit to GLOSSARY_UNWRITABLE with the cause", async () => {
    const { cwd, path } = await seed();
    const cause = releaseFailure();
    const fs: SdkFs = {
      ...defaultFs,
      rename: async () => {
        throw cause;
      },
      deleteFile: async () => {
        throw cause;
      },
    };

    const error = await rejection(edit(cwd, path, fs));

    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({
      code: "GLOSSARY_UNWRITABLE",
      message: expect.stringMatching(
        /^Could not write the glossary write lock \.verbatra-local\/.+ \(EPERM\)\..* The glossary edit was saved, but the lock could not be released/,
      ),
      cause,
    });
    expect(JSON.parse(await readTextFile(path))).toEqual({ brand: "Verbatra", cli: "CLI" });
  });

  it("reports the edit's own failure when the release fails after it", async () => {
    const { cwd, path } = await seed();
    const writeFailure = Object.assign(new Error("EROFS: read-only file system"), {
      code: "EROFS",
    });
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async () => {
        throw writeFailure;
      },
      deleteFile: async () => {
        throw releaseFailure();
      },
    };

    expect(await rejection(edit(cwd, path, fs))).toMatchObject({
      code: "GLOSSARY_UNWRITABLE",
      cause: writeFailure,
    });
    expect(await readTextFile(path)).toBe(ORIGINAL);
  });
});
