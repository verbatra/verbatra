import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdapterError, AdapterRegistry, createDefaultRegistry } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { valueHash } from "../lock/provenance-file.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { applyValueReplace, previewValueReplace } from "./value-replace.js";

const config = baseConfig({ targetLocales: ["de", "fr"], format: "i18next-json" });

interface Fixture {
  readonly dir: string;
}

async function fixture(
  de: Record<string, string>,
  fr: Record<string, string> | string,
): Promise<Fixture> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { a: "Hello", b: "Bye" });
  await writeJsonFile(join(dir, "locales", "de.json"), de);
  if (typeof fr === "string") {
    await writeFile(join(dir, "locales", "fr.json"), fr, "utf8");
  } else {
    await writeJsonFile(join(dir, "locales", "fr.json"), fr);
  }
  return { dir };
}

function registryFailingWriteFor(locale: string): AdapterRegistry {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("no adapter registered for i18next-json");
  }
  const base = resolution.adapter;
  return new AdapterRegistry().register({
    ...base,
    write: async (resource, filePath, context) => {
      if (resource.locale === locale) {
        throw new AdapterError("ADAPTER_FAILED", "the disk refused the write");
      }
      return base.write(resource, filePath, context);
    },
  });
}

async function readDe(dir: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
}

describe("applyValueReplace: a locale that fails", () => {
  it("keeps the outcomes of earlier locales and reports the corrupt locale", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, '{ "a": "Salut X", "b": ');
    const preview = await previewValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      locales: ["de"],
    });
    const refs = [
      ...preview.entries.map(({ locale, key, valueHash: hash }) => ({
        locale,
        key,
        valueHash: hash,
      })),
      { locale: "fr", key: "a", valueHash: valueHash("Salut X") },
    ];

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries: refs,
      actor: "human",
    });

    expect(result.outcomes).toEqual([
      { locale: "de", key: "a", status: "applied", staleSource: false },
      { locale: "fr", key: "a", status: "skipped", reason: "locale-failed" },
    ]);
    expect(result.counts).toEqual({
      applied: 1,
      skipped: 1,
      refused: 0,
      changed: 0,
      "too-long": 0,
    });
    expect(result.localeFailures).toEqual([
      {
        locale: "fr",
        code: "INVALID_JSON",
        message:
          "The fr locale file at locales/fr.json could not be read: The file is not valid JSON (line 1, column 24).",
      },
    ]);
    expect(await readDe(dir)).toEqual({ a: "Hallo Y" });
  });

  it("carries on with the locales after the failed one", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "Hello" });
    await writeFile(join(dir, "locales", "de.json"), "{ not json", "utf8");
    await writeJsonFile(join(dir, "locales", "fr.json"), { a: "Salut X" });

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries: [
        { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
        { locale: "fr", key: "a", valueHash: valueHash("Salut X") },
      ],
      actor: "human",
    });

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["skipped", "applied"]);
    expect(result.localeFailures.map((failure) => failure.locale)).toEqual(["de"]);
    expect(
      ((await readJsonFile(join(dir, "locales", "fr.json"))) as Record<string, string>).a,
    ).toBe("Salut Y");
  });

  it("names the failure's own code and keeps the outcomes already settled in that locale", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X", b: "Au revoir X" });

    const result = await applyValueReplace(
      {
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [
          { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
          { locale: "fr", key: "a", valueHash: valueHash("never listed") },
          { locale: "fr", key: "b", valueHash: valueHash("Au revoir X") },
        ],
        actor: "human",
      },
      { adapterRegistry: registryFailingWriteFor("fr") },
    );

    expect(result.outcomes).toEqual([
      { locale: "de", key: "a", status: "applied", staleSource: false },
      { locale: "fr", key: "a", status: "changed" },
      { locale: "fr", key: "b", status: "skipped", reason: "locale-failed" },
    ]);
    expect(result.localeFailures).toEqual([
      { locale: "fr", code: "ADAPTER_FAILED", message: "the disk refused the write" },
    ]);
  });

  it("keeps a gate-refused entry refused when the locale then fails to write", async () => {
    const { dir } = await fixture({ a: "Hallo Z", b: "Z" }, { a: "Salut" });

    const result = await applyValueReplace(
      {
        config,
        cwd: dir,
        find: "Z",
        replace: "",
        entries: [
          { locale: "de", key: "a", valueHash: valueHash("Hallo Z") },
          { locale: "de", key: "b", valueHash: valueHash("Z") },
        ],
        actor: "human",
      },
      { adapterRegistry: registryFailingWriteFor("de") },
    );

    expect(result.outcomes).toEqual([
      { locale: "de", key: "a", status: "skipped", reason: "locale-failed" },
      { locale: "de", key: "b", status: "refused", reason: "empty" },
    ]);
    expect(result.localeFailures).toEqual([
      { locale: "de", code: "ADAPTER_FAILED", message: "the disk refused the write" },
    ]);
    expect(await readDe(dir)).toEqual({ a: "Hallo Z", b: "Z" });
  });

  it.each(["verbatra.provenance.json", "verbatra.lock.json"])(
    "reports written values as applied and the failure as fileWritten when %s cannot be written",
    async (stateFile) => {
      const { dir } = await fixture({ a: "Hallo Z", b: "Z" }, { a: "Salut" });
      let localeFileWritten = false;
      const fs: SdkFs = {
        ...defaultFs,
        writeFile: async (path, data) => {
          if (localeFileWritten && path.endsWith(stateFile)) {
            throw Object.assign(new Error("EACCES injected"), { code: "EACCES" });
          }
          await defaultFs.writeFile(path, data);
          localeFileWritten ||= path.endsWith("de.json");
        },
      };

      const result = await applyValueReplace(
        {
          config,
          cwd: dir,
          find: "Z",
          replace: "",
          entries: [
            { locale: "de", key: "a", valueHash: valueHash("Hallo Z") },
            { locale: "de", key: "b", valueHash: valueHash("Z") },
          ],
          actor: "human",
        },
        { fs },
      );

      expect(result.outcomes).toEqual([
        { locale: "de", key: "a", status: "applied", staleSource: false },
        { locale: "de", key: "b", status: "refused", reason: "empty" },
      ]);
      expect(result.counts).toEqual({
        applied: 1,
        skipped: 0,
        refused: 1,
        changed: 0,
        "too-long": 0,
      });
      expect(result.localeFailures).toEqual([
        { locale: "de", code: "EACCES", message: "EACCES injected", fileWritten: true },
      ]);
      expect(await readDe(dir)).toEqual({ a: "Hallo ", b: "Z" });
    },
  );

  it.each([
    { name: "no write fails", failLockFile: false, code: "LOCK_CONTENDED" },
    { name: "the lock file write fails", failLockFile: true, code: "EACCES" },
  ])(
    "keeps fileWritten and the real cause when the write lock is gone at release and $name",
    async ({ failLockFile, code }) => {
      const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X" });
      const writeLock = join(dir, ".verbatra-local", "locks", "de.lock");
      let localeFileWritten = false;
      const fs: SdkFs = {
        ...defaultFs,
        writeFile: async (path, data) => {
          if (localeFileWritten && path.endsWith("verbatra.lock.json")) {
            await rm(writeLock, { force: true });
            if (failLockFile) {
              throw Object.assign(new Error("EACCES injected"), { code: "EACCES" });
            }
          }
          await defaultFs.writeFile(path, data);
          localeFileWritten ||= path.endsWith("de.json");
        },
      };

      const result = await applyValueReplace(
        {
          config,
          cwd: dir,
          find: "X",
          replace: "Y",
          entries: [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }],
          actor: "human",
        },
        { fs },
      );

      expect(result.outcomes).toEqual([
        { locale: "de", key: "a", status: "applied", staleSource: false },
      ]);
      expect(result.localeFailures.map(({ locale, fileWritten }) => [locale, fileWritten])).toEqual(
        [["de", true]],
      );
      expect(result.localeFailures[0]?.code).toBe(code);
      expect(await readDe(dir)).toEqual({ a: "Hallo Y" });
    },
  );

  it("leaves verbatra.lock.json untouched when the source file is missing", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "pt-BR.json"), { a: "Ola X" });
    const lockPath = join(dir, "verbatra.lock.json");
    await writeJsonFile(lockPath, { version: 1, locales: { pt_BR: { a: "older-hash" } } });
    const before = await readFile(lockPath, "utf8");

    const result = await applyValueReplace({
      config: baseConfig({ targetLocales: ["pt-BR"], format: "i18next-json" }),
      cwd: dir,
      find: "X",
      replace: "Y",
      entries: [{ locale: "pt-BR", key: "a", valueHash: valueHash("Ola X") }],
      actor: "human",
    });

    expect(result.localeFailures.map((failure) => [failure.locale, failure.code])).toEqual([
      ["pt-BR", "SOURCE_UNREADABLE"],
    ]);
    expect(result.localeFailures[0]).not.toHaveProperty("fileWritten");
    expect(await readFile(lockPath, "utf8")).toBe(before);
  });

  it("reports a failure that is not an entry-edits failure as a locale failure and writes nothing", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X" });
    const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
    if (resolution.status !== "resolved") {
      throw new Error("no adapter registered for i18next-json");
    }
    const base = resolution.adapter;
    const adapterRegistry = new AdapterRegistry().register({
      ...base,
      validateMessage: () => {
        throw new AdapterError("ADAPTER_FAILED", "the validator blew up");
      },
    });

    const result = await applyValueReplace(
      {
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }],
        actor: "human",
      },
      { adapterRegistry },
    );

    expect(result.outcomes).toEqual([
      { locale: "de", key: "a", status: "skipped", reason: "locale-failed" },
    ]);
    expect(result.localeFailures).toEqual([
      { locale: "de", code: "ADAPTER_FAILED", message: "the validator blew up" },
    ]);
    expect(await readDe(dir)).toEqual({ a: "Hallo X" });
  });

  it("reports no failures when every locale applies", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X" });

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries: [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }],
      actor: "human",
    });

    expect(result.localeFailures).toEqual([]);
  });

  it("reports a source file that cannot be parsed as a failure of every locale, writing nothing", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X" });
    await writeFile(join(dir, "locales", "en.json"), "{ not json", "utf8");

    const result = await applyValueReplace({
      config,
      cwd: dir,
      find: "X",
      replace: "Y",
      entries: [
        { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
        { locale: "fr", key: "a", valueHash: valueHash("Salut X") },
      ],
      actor: "human",
    });

    expect(result.localeFailures.map((failure) => [failure.locale, failure.code])).toEqual([
      ["de", "SOURCE_INVALID"],
      ["fr", "SOURCE_INVALID"],
    ]);
    expect(result.counts.skipped).toBe(2);
    expect((await readDe(dir)).a).toBe("Hallo X");
  });

  it("still refuses a corrupt lock file before writing any locale", async () => {
    const { dir } = await fixture({ a: "Hallo X" }, { a: "Salut X" });
    await writeFile(join(dir, "verbatra.lock.json"), "{ not json", "utf8");

    await expect(
      applyValueReplace({
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }],
        actor: "human",
      }),
    ).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });
    expect((await readDe(dir)).a).toBe("Hallo X");
  });
});
