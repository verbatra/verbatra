import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdapterRegistry, type LoadedConfig, type SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { localeValuesHandler, readAllLocaleValues } from "./locale-values.js";

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
  it("returns every value of every locale when called without parameters", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      expect(await localeValuesHandler({}, deps(project))).toEqual(
        await readAllLocaleValues(deps(project)),
      );
    } finally {
      await project.cleanup();
    }
  });

  it("returns source and target text for every configured target locale", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });

      const result = await readAllLocaleValues(deps(project));

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
      const result = await readAllLocaleValues(deps(project));

      expect(result[0]?.values.greeting).toEqual({ source: "hello" });
    } finally {
      await project.cleanup();
    }
  });

  it("omits source for an orphaned key present only in the target", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo", legacy: "old" });

      const result = await readAllLocaleValues(deps(project));

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

        const result = await readAllLocaleValues(deps(project));

        expect(JSON.stringify(result)).toBe(
          `[{"locale":"de","keys":[${JSON.stringify(key)}],"values":{${JSON.stringify(key)}:{"source":"source","target":"target","provenance":{"origin":"unrecorded","reviewState":"unreviewed"}}}}]`,
        );
      } finally {
        await project.cleanup();
      }
    },
  );
});

describe("localeValuesHandler: paged for agents", () => {
  it("returns one page of entries and a cursor that reaches the rest", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { alpha: "a", beta: "b", gamma: "c" },
    );
    try {
      const first = await localeValuesHandler({ paged: true, limit: 2 }, deps(project));
      const cursor = "nextCursor" in first ? first.nextCursor : undefined;
      const second = await localeValuesHandler(
        { paged: true, limit: 2, ...(cursor !== undefined ? { cursor } : {}) },
        deps(project),
      );

      expect(first).toEqual({
        locales: [
          {
            locale: "de",
            entries: [
              { key: "alpha", source: "a" },
              { key: "beta", source: "b" },
            ],
          },
        ],
        nextCursor: expect.any(String),
      });
      expect(second).toEqual({
        locales: [{ locale: "de", entries: [{ key: "gamma", source: "c" }] }],
      });
    } finally {
      await project.cleanup();
    }
  });

  it("narrows the page by query and locale", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello", title: "Welcome" },
    );
    try {
      await writeTargetFile(project, "fr", { title: "Bienvenue" });

      const result = await localeValuesHandler(
        { paged: true, locales: ["fr"], query: "BIENVENUE" },
        deps(project),
      );

      expect(result).toEqual({
        locales: [
          {
            locale: "fr",
            entries: [
              {
                key: "title",
                source: "Welcome",
                target: "Bienvenue",
                provenance: { origin: "unrecorded", reviewState: "unreviewed" },
              },
            ],
          },
        ],
      });
    } finally {
      await project.cleanup();
    }
  });

  it("returns only the listed keys", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "hello", title: "Welcome" },
    );
    try {
      const result = await localeValuesHandler({ paged: true, keys: ["title"] }, deps(project));

      expect(result).toEqual({
        locales: [{ locale: "de", entries: [{ key: "title", source: "Welcome" }] }],
      });
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a cursor that no longer matches with PAGE_CURSOR_INVALID", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(
        localeValuesHandler({ paged: true, cursor: "not-a-cursor" }, deps(project)),
      ).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID" });
    } finally {
      await project.cleanup();
    }
  });
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
