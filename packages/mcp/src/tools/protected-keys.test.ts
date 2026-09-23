import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { editEntry } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeContext,
  makeProject,
  makeStubProvider,
  writeJsonFile,
} from "../test-support.js";
import { editEntryTool } from "./edit-entry.js";
import { retranslateEntryTool } from "./retranslate-entry.js";
import { translatePendingTool } from "./translate-pending.js";

async function humanEditedProject(): Promise<string> {
  const dir = await makeProject({ greeting: "Hello" }, { de: {} });
  await editEntry({
    config: baseVerbatraConfig(),
    cwd: dir,
    locale: "de",
    key: "greeting",
    value: "Hallo",
  });
  return dir;
}

describe("agent tools and protected keys", () => {
  it("translation.retranslateEntry refuses a value a person wrote and leaves it in place", async () => {
    const dir = await humanEditedProject();
    const context = makeContext({ cwd: dir, createProvider: () => makeStubProvider() });

    const outcome = await retranslateEntryTool.execute({ locale: "de", key: "greeting" }, context);

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("KEY_PROTECTED"),
    });
    expect(JSON.parse(await readFile(join(dir, "locales", "de.json"), "utf8"))).toEqual({
      greeting: "Hallo",
    });
  });

  it("translation.editEntry refuses a pinned key", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({
      cwd: dir,
      config: baseLoadedConfig({ config: baseVerbatraConfig({ pinnedKeys: ["greeting"] }) }),
    });

    const outcome = await editEntryTool.execute(
      { locale: "de", key: "greeting", value: "Hallo" },
      context,
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("KEY_PINNED"),
    });
  });

  it("translation.translatePending leaves a protected key alone and lists it", async () => {
    const dir = await humanEditedProject();
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello there" });
    const context = makeContext({ cwd: dir, createProvider: () => makeStubProvider() });

    const outcome = await translatePendingTool.execute({}, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ protected: [{ key: "greeting", reason: "human" }] }] },
    });
  });
});
