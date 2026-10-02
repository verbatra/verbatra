import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdapterRegistry, type LoadedConfig, type SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { localeValuesHandler } from "./locale-values.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

async function writeTargetFile(
  project: FixtureProject,
  locale: string,
  entries: Readonly<Record<string, string>>,
): Promise<void> {
  await writeFile(
    join(project.root, "locales", `${locale}.json`),
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );
}

describe("localeValuesHandler", () => {
  it("returns source and target text for every configured target locale", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });

      const result = await localeValuesHandler({}, deps(project));

      expect(result).toEqual([
        {
          locale: "de",
          keys: ["greeting"],
          values: {
            greeting: {
              source: "hello",
              target: "hallo",
              provenance: { origin: "unrecorded", reviewState: "unreviewed" },
            },
          },
        },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("omits target for a key not yet translated", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await localeValuesHandler({}, deps(project));

      expect(result[0]?.values.greeting).toEqual({ source: "hello" });
    } finally {
      await project.cleanup();
    }
  });

  it("omits source for an orphaned key present only in the target", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo", legacy: "old" });

      const result = await localeValuesHandler({}, deps(project));

      expect(result[0]?.values.legacy).toEqual({
        target: "old",
        provenance: { origin: "unrecorded", reviewState: "unreviewed" },
      });
    } finally {
      await project.cleanup();
    }
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "serializes a catalog key named %s into the JSON the RPC envelope sends",
    async (key) => {
      const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
      try {
        await writeFile(
          join(project.root, "locales", "en.json"),
          `{${JSON.stringify(key)}:"source"}`,
          "utf8",
        );
        await writeFile(
          join(project.root, "locales", "de.json"),
          `{${JSON.stringify(key)}:"target"}`,
          "utf8",
        );

        const result = await localeValuesHandler({}, deps(project));

        expect(JSON.stringify(result)).toBe(
          `[{"locale":"de","keys":[${JSON.stringify(key)}],"values":{${JSON.stringify(key)}:{"source":"source","target":"target","provenance":{"origin":"unrecorded","reviewState":"unreviewed"}}}}]`,
        );
      } finally {
        await project.cleanup();
      }
    },
  );
});

describe("localeValuesHandler: injected seams", () => {
  it("reads through the injected file system", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    const fs: SdkFs = {
      fileExists: async () => false,
      readFileBounded: async () => ({ kind: "missing" }),
      readBytesBounded: async () => ({ kind: "missing" }),
      writeFile: async () => {},
      writeBytes: async () => {},
      createExclusive: async () => true,
      deleteFile: async () => {},
    };
    try {
      await expect(localeValuesHandler({}, { ...deps(project), fs })).rejects.toMatchObject({
        code: "SOURCE_UNREADABLE",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("resolves the format through the injected adapter registry", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(
        localeValuesHandler({}, { ...deps(project), adapterRegistry: new AdapterRegistry() }),
      ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
    } finally {
      await project.cleanup();
    }
  });
});
