import { chmod, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { LocaleResource } from "@verbatra/core";
import { AdapterError, type FormatAdapter } from "@verbatra/format-adapters";
import { afterEach, describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { translate } from "./translate-project.js";
import {
  escapesWorkingDirectory,
  targetUnwritableMessage,
  writeTargetResource,
} from "./write-target.js";

const lockedDirectories: string[] = [];

afterEach(async () => {
  for (const directory of lockedDirectories.splice(0)) {
    await chmod(directory, 0o700);
  }
});

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

async function projectWithUnwritableLocaleDir(): Promise<string> {
  const dir = await makeTempDir();
  const locales = join(dir, "locales");
  await mkdir(locales);
  await writeJsonFile(join(locales, "en.json"), { greeting: "Hello" });
  await chmod(locales, 0o500);
  lockedDirectories.push(locales);
  return dir;
}

describe("translate: an unwritable target directory", () => {
  it("reports a structured TARGET_UNWRITABLE failure instead of the raw fs code", async () => {
    const dir = await projectWithUnwritableLocaleDir();
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.failed).toEqual(["de"]);
    expect(summary.locales[0]?.error?.code).toBe("TARGET_UNWRITABLE");
  });

  it("names the real target file and never the internal temp path", async () => {
    const dir = await projectWithUnwritableLocaleDir();
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const message = summary.locales[0]?.error?.message ?? "";
    expect(message).toContain("locales/de.json");
    expect(message).not.toContain(".tmp-");
    expect(message).not.toContain(".de.json.tmp");
  });

  it("tells the reader what to do about it", async () => {
    const dir = await projectWithUnwritableLocaleDir();
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales[0]?.error?.message).toContain(
      "Check the write permissions on the containing directory, then run again.",
    );
  });
});

const CWD = resolve("/proj");
const TARGET = resolve(CWD, "locales/de.json");

function fsError(code: string): Error {
  return Object.assign(new Error(`${code}: whatever, open '${TARGET}.tmp-1-2-3'`), { code });
}

describe("targetUnwritableMessage", () => {
  it("shows the target path relative to cwd, with forward slashes", () => {
    expect(targetUnwritableMessage(TARGET, CWD, fsError("EACCES"))).toContain("locales/de.json");
  });

  it("falls back to the absolute path when the target sits outside cwd", () => {
    const outside = resolve("/elsewhere/de.json");

    expect(targetUnwritableMessage(outside, CWD, fsError("EACCES"))).toContain(outside);
  });

  it("names a target inside a directory whose name merely begins with two dots relative to cwd", () => {
    const dotted = resolve(CWD, "..locales/de.json");

    const message = targetUnwritableMessage(dotted, CWD, fsError("EACCES"));

    expect(message).toContain("Could not write the locale file ..locales/de.json");
    expect(message).not.toContain(dotted);
  });

  it.each([
    ["EPERM", "Check the write permissions on the containing directory"],
    ["EROFS", "mounted read-only"],
    ["ENOSPC", "no space left"],
    ["ENOENT", "exists and is reachable"],
    ["EISDIR", "A directory already exists at that path"],
  ])("explains %s specifically", (code, expected) => {
    const message = targetUnwritableMessage(TARGET, CWD, fsError(code));

    expect(message).toContain(`(${code})`);
    expect(message).toContain(expected);
  });

  it("falls back to a generic remedy for an unrecognized file-system code", () => {
    const message = targetUnwritableMessage(TARGET, CWD, fsError("EMFILE"));

    expect(message).toContain("(EMFILE)");
    expect(message).toContain("exists and is writable");
  });

  it("omits the code entirely when the failure carries none", () => {
    const message = targetUnwritableMessage(TARGET, CWD, new Error("no code here"));

    expect(message).not.toContain("(");
    expect(message).toContain("exists and is writable");
  });

  it("never repeats the underlying message, which is where the temp path lives", () => {
    expect(targetUnwritableMessage(TARGET, CWD, fsError("EACCES"))).not.toContain(".tmp-");
  });
});

function adapterWriting(reject: unknown): FormatAdapter {
  return {
    format: "i18next-json",
    canHandle: () => true,
    read: async () => {
      throw new Error("not used");
    },
    write: async () => {
      throw reject;
    },
    extractPlaceholders: () => [],
    validateMessage: () => true,
  };
}

const RESOURCE: LocaleResource = {
  locale: "de",
  namespace: "translation",
  format: "i18next-json",
  entries: new Map(),
};

describe("writeTargetResource", () => {
  it("wraps a raw file-system failure as TARGET_UNWRITABLE", async () => {
    const error = await writeTargetResource(
      adapterWriting(fsError("EACCES")),
      RESOURCE,
      TARGET,
      CWD,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("TARGET_UNWRITABLE");
  });

  it("lets an AdapterError through untouched, so its own code survives", async () => {
    const original = new AdapterError("INVALID_STRUCTURE", "cannot represent this");

    await expect(writeTargetResource(adapterWriting(original), RESOURCE, TARGET, CWD)).rejects.toBe(
      original,
    );
  });

  it("lets an SdkError through untouched", async () => {
    const original = new SdkError("LOCK_FILE_INVALID", "corrupt");

    await expect(writeTargetResource(adapterWriting(original), RESOURCE, TARGET, CWD)).rejects.toBe(
      original,
    );
  });

  it("resolves quietly when the adapter write succeeds", async () => {
    const adapter = { ...adapterWriting(new Error("x")), write: async () => {} };

    await expect(writeTargetResource(adapter, RESOURCE, TARGET, CWD)).resolves.toBeUndefined();
  });
});

describe("escapesWorkingDirectory", () => {
  it.each([
    ["the working directory itself", ""],
    ["its parent", ".."],
    ["a path through its parent", `..${sep}elsewhere`],
    ["an absolute path, as relative returns across drives", resolve("/elsewhere")],
  ])("refuses %s", (_label, inside) => {
    expect(escapesWorkingDirectory(inside)).toBe(true);
  });

  it.each([
    ["a nested file", join("locales", "de.json")],
    ["a directory whose name merely begins with two dots", join("..pseudo", "de.json")],
    ["a file whose name merely begins with two dots", "..d.ts"],
  ])("accepts %s", (_label, inside) => {
    expect(escapesWorkingDirectory(inside)).toBe(false);
  });
});
