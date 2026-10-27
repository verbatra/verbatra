import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { editEntry } from "./edit-entry.js";
import { retranslateEntry } from "./retranslate-entry.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello", farewell: "Bye" });
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo", farewell: "Tschau" });
  return dir;
}

async function humanProject(): Promise<string> {
  const dir = await project();
  await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
  return dir;
}

function retranslate(dir: string, config: VerbatraConfig, includeHuman?: boolean) {
  const stub = makeStubProvider();
  return {
    stub,
    result: retranslateEntry(
      {
        config,
        cwd: dir,
        locale: "de",
        key: "greeting",
        ...(includeHuman !== undefined ? { includeHuman } : {}),
      },
      { createProvider: () => stub.provider },
    ),
  };
}

describe("retranslateEntry: protected values", () => {
  it("refuses a value a person wrote before calling the provider", async () => {
    const dir = await humanProject();
    const { stub, result } = retranslate(dir, cfg());

    await expect(result).rejects.toMatchObject({ code: "KEY_PROTECTED" });
    expect(stub.calls).toHaveLength(0);
  });

  it("replaces it with includeHuman or under humanEdits overwrite", async () => {
    const explicit = retranslate(await humanProject(), cfg(), true);
    const configured = retranslate(await humanProject(), cfg({ humanEdits: "overwrite" }));

    await expect(explicit.result).resolves.toMatchObject({ accepted: true });
    await expect(configured.result).resolves.toMatchObject({ accepted: true });
  });

  it("retranslates a value with no record", async () => {
    const { result } = retranslate(await project(), cfg());

    await expect(result).resolves.toMatchObject({ accepted: true });
  });

  it("refuses when the provenance file is from a newer verbatra, since the origin cannot be read", async () => {
    const dir = await project();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), '{"version":9,"locales":{}}', "utf8");

    await expect(retranslate(dir, cfg()).result).rejects.toMatchObject({ code: "KEY_PROTECTED" });
  });

  it("refuses a pinned key even with includeHuman, before constructing the provider", async () => {
    const dir = await project();
    let constructed = false;

    await expect(
      retranslateEntry(
        {
          config: cfg({ pinnedKeys: ["greet*"] }),
          cwd: dir,
          locale: "de",
          key: "greeting",
          includeHuman: true,
        },
        {
          createProvider: () => {
            constructed = true;
            return makeStubProvider().provider;
          },
        },
      ),
    ).rejects.toMatchObject({ code: "KEY_PINNED" });
    expect(constructed).toBe(false);
  });
});

describe("editEntry: pinned keys", () => {
  it("refuses an agent's edit of a pinned key and accepts a person's", async () => {
    const dir = await project();
    const config = cfg({ pinnedKeys: ["greeting"] });
    const edit = { config, cwd: dir, locale: "de", key: "greeting", value: "Servus" };

    await expect(editEntry({ ...edit, actor: "agent" })).rejects.toMatchObject({
      code: "KEY_PINNED",
    });
    await expect(editEntry(edit)).resolves.toMatchObject({ accepted: true });
  });

  it("accepts an agent's edit of a human value that is not pinned", async () => {
    const dir = await humanProject();

    await expect(
      editEntry({
        config: cfg(),
        cwd: dir,
        locale: "de",
        key: "greeting",
        value: "Servus",
        actor: "agent",
      }),
    ).resolves.toMatchObject({ accepted: true });
  });
});
