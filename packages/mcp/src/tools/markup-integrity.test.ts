import { join } from "node:path";
import { LOCK_FILE_NAME } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  defaultAdapterRegistry,
  makeContext,
  makeProject,
  nodeFs,
  writeJsonFile,
} from "../test-support.js";
import { editEntryTool } from "./edit-entry.js";
import { keyIntegrityTool } from "./key-integrity.js";

async function markStale(dir: string, locale: string, key: string): Promise<void> {
  await writeJsonFile(join(dir, LOCK_FILE_NAME), {
    version: 1,
    locales: { [locale]: { [key]: "stale-baseline-hash" } },
  });
}

describe("translation.editEntry: an inline-markup refusal reaches the agent with its tags", () => {
  it("names the dropped tags in details and writes nothing", async () => {
    const dir = await makeProject({ docs: 'Read <a href="/docs">the docs</a>' }, { de: {} });

    const outcome = await editEntryTool.execute(
      { locale: "de", key: "docs", value: "Lies die Doku" },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        accepted: false,
        reason: "markup",
        value: "Lies die Doku",
        details: ["-</a>", "-<a href>"],
      },
      structuredContent: {
        accepted: false,
        reason: "markup",
        value: "Lies die Doku",
        details: ["-</a>", "-<a href>"],
      },
    });
  });

  it("carries no details when the markup is broken with no single tag at fault", async () => {
    const dir = await makeProject({ pair: "<b>Save</b><i>Close</i>" }, { de: {} });

    const outcome = await editEntryTool.execute(
      { locale: "de", key: "pair", value: "<b>Speichern<i>Schliessen</b></i>" },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        accepted: false,
        reason: "markup",
        value: "<b>Speichern<i>Schliessen</b></i>",
      },
      structuredContent: {
        accepted: false,
        reason: "markup",
        value: "<b>Speichern<i>Schliessen</b></i>",
      },
    });
  });
});

describe("key.integrity: markup drift already on disk reaches the agent", () => {
  it("reports markupMatches false and names the tags the translation dropped", async () => {
    const dir = await makeProject(
      { docs: "Read <b>the docs</b> now" },
      { de: { docs: "Lies die Doku" } },
    );
    await markStale(dir, "de", "docs");

    const outcome = await keyIntegrityTool.execute({ key: "docs" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        locales: [
          {
            locale: "de",
            entries: [
              {
                matches: true,
                icuValid: true,
                markupMatches: false,
                markupDetails: ["-</b>", "-<b>"],
              },
            ],
          },
        ],
      },
    });
  });

  it("reports markupMatches true with no details for a translation that kept its tags", async () => {
    const dir = await makeProject(
      { docs: "Read <b>the docs</b> now" },
      { de: { docs: "Lies <b>die Doku</b>" } },
    );
    await markStale(dir, "de", "docs");

    const outcome = await keyIntegrityTool.execute({ key: "docs" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        locales: [{ entries: [{ markupMatches: true, markupDetails: [] }] }],
      },
    });
  });

  it("leaves prose that merely contains a less-than sign alone", async () => {
    const dir = await makeProject(
      { wait: "Wait < 5 minutes now" },
      { de: { wait: "Warte < 5 Minuten" } },
    );
    await markStale(dir, "de", "wait");

    const outcome = await keyIntegrityTool.execute({ key: "wait" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ entries: [{ markupMatches: true, markupDetails: [] }] }] },
    });
  });
});
