import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TranslateRequest, TranslateResult } from "@verbatra/ai-providers";
import {
  AdapterRegistry,
  createDefaultRegistry,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { updateGlossaryTerm } from "../config/glossary-file.js";
import { editEntry } from "../flow/edit-entry.js";
import { translate } from "../flow/translate-project.js";
import { defaultFs, type SdkFs } from "../fs.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { glossaryGuardPath, localeLockPath } from "./locale-write-lock.js";

const TAKEN_OVER = JSON.stringify({ pid: 1, hostname: "elsewhere", nonce: "someone-else" });

const cfg = () => baseConfig({ targetLocales: ["de"], format: "i18next-json" });

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo" });
  return dir;
}

async function takeOver(path: string): Promise<void> {
  await writeFile(path, TAKEN_OVER, "utf8");
}

function registryTakingOverOnRead(dir: string): AdapterRegistry {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("no i18next adapter");
  }
  const base = resolution.adapter;
  const adapter: FormatAdapter = {
    ...base,
    read: async (filePath, locale) => {
      if (locale === "de") {
        await takeOver(localeLockPath(dir, "de"));
      }
      return base.read(filePath, locale);
    },
  };
  return new AdapterRegistry().register(adapter);
}

describe("a write lock taken over while an operation holds it", () => {
  it("fails translate's locale with LOCK_CONTENDED and writes neither the locale file nor the lock file", async () => {
    const dir = await project();
    const stub = makeStubProvider();
    const provider = {
      ...stub.provider,
      translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
        await takeOver(localeLockPath(dir, "de"));
        return stub.provider.translateBatch(request);
      },
    };
    await writeJsonFile(join(dir, "locales", "de.json"), {});

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider },
    );

    expect(summary.failed).toEqual(["de"]);
    expect(summary.locales[0]?.error).toMatchObject({ code: "LOCK_CONTENDED" });
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({});
    await expect(readFile(join(dir, "verbatra.lock.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(localeLockPath(dir, "de"), "utf8")).toBe(TAKEN_OVER);
  });

  it("fails editEntry with LOCK_CONTENDED and leaves the locale file as it was", async () => {
    const dir = await project();

    await expect(
      editEntry(
        { config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Servus" },
        { adapterRegistry: registryTakingOverOnRead(dir) },
      ),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });

  it("fails a glossary edit with LOCK_CONTENDED and leaves the glossary file as it was", async () => {
    const dir = await project();
    const path = join(dir, "glossary.json");
    await writeJsonFile(path, { brand: "Verbatra" });
    await mkdir(join(dir, ".verbatra-local", "locks"), { recursive: true });
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async (file: string, maxBytes: number) => {
        if (file === path) {
          await takeOver(glossaryGuardPath(dir));
        }
        return defaultFs.readFileBounded(file, maxBytes);
      },
    };

    await expect(
      updateGlossaryTerm(
        {
          glossary: { source: "file", path },
          cwd: dir,
          term: "cli",
          translation: "CLI",
        },
        { fs },
      ),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(await readJsonFile(path)).toEqual({ brand: "Verbatra" });
  });
});
