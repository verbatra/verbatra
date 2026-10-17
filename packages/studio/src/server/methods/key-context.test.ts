import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRegistry, type LoadedConfig, type SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { keyContextHandler } from "./key-context.js";

const EMPTY_FS: SdkFs = {
  fileExists: async () => false,
  readFileBounded: async () => ({ kind: "missing" }),
  readBytesBounded: async () => ({ kind: "missing" }),
  writeFile: async () => {},
  writeBytes: async () => {},
  createExclusive: async () => true,
  deleteFile: async () => {},
};

function deps(
  project: FixtureProject,
  glossary: LoadedConfig["glossary"],
  extra: Partial<RpcHandlerDeps> = {},
): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary,
  };
  return { config: loaded, projectRoot: project.root, ...extra };
}

async function withProject(
  overrides: Parameters<typeof makeFixtureProject>[0],
  run: (project: FixtureProject) => Promise<void>,
): Promise<void> {
  const project = await makeFixtureProject(overrides, {
    greeting: "Add it to your cart",
    title: "Welcome",
  });
  try {
    await writeFile(
      join(project.root, "locales", "de.json"),
      `${JSON.stringify({ greeting: "Leg es in den Korb" })}\n`,
      "utf8",
    );
    await run(project);
  } finally {
    await project.cleanup();
  }
}

describe("keyContextHandler", () => {
  it("returns the key's values with the glossary terms its source text uses", async () => {
    await withProject(
      {
        targetLocales: ["de"],
        glossary: {
          version: 2,
          terms: [
            { source: "cart", target: "Warenkorb", forbidden: { de: ["Karren"] } },
            { source: "invoice", target: "Rechnung" },
          ],
          doNotTranslate: [],
        },
      },
      async (project) => {
        const result = await keyContextHandler(
          { locale: "de", key: "greeting" },
          deps(project, { source: "inline" }),
        );

        expect(result).toEqual({
          source: "Add it to your cart",
          target: "Leg es in den Korb",
          provenance: { origin: "unrecorded", reviewState: "unreviewed" },
          glossary: {
            terms: [
              {
                source: "cart",
                target: "Warenkorb",
                forbidden: ["Karren"],
                caseSensitive: false,
              },
            ],
            doNotTranslate: [],
          },
        });
      },
    );
  });

  it("checks a draft against the applying terms and reports the key's length budget", async () => {
    await withProject(
      {
        targetLocales: ["de"],
        maxLength: { greeting: 12 },
        glossary: {
          version: 2,
          terms: [{ source: "cart", target: "Warenkorb", forbidden: { de: ["Karren"] } }],
          doNotTranslate: [],
        },
      },
      async (project) => {
        const result = await keyContextHandler(
          { locale: "de", key: "greeting", draft: "Leg es in den Karren" },
          deps(project, { source: "inline" }),
        );

        expect(result.maxLength).toBe(12);
        expect(result.draftCheck).toEqual({
          terms: [
            { source: "cart", target: "Warenkorb", targetUsed: false, forbiddenUsed: ["Karren"] },
          ],
          doNotTranslate: [],
        });
      },
    );
  });

  it("redacts a secret-shaped glossary translation before it leaves the handler", async () => {
    const secret = `sk-${"a1".repeat(24)}`;
    await withProject({ targetLocales: ["de"], glossary: { cart: secret } }, async (project) => {
      const result = await keyContextHandler(
        { locale: "de", key: "greeting" },
        deps(project, { source: "inline" }),
      );

      expect(result.glossary.terms[0]?.target).toBe("[REDACTED]");
      expect(JSON.stringify(result)).not.toContain(secret);
    });
  });

  it("reports no glossary entries for a project without a glossary", async () => {
    await withProject({ targetLocales: ["de"] }, async (project) => {
      const result = await keyContextHandler(
        { locale: "de", key: "title" },
        deps(project, { source: "none" }, { adapterRegistry: createDefaultRegistry() }),
      );

      expect(result).toEqual({ source: "Welcome", glossary: { terms: [], doNotTranslate: [] } });
    });
  });

  it("reads through the injected file system", async () => {
    await withProject({ targetLocales: ["de"] }, async (project) => {
      await expect(
        keyContextHandler(
          { locale: "de", key: "title" },
          deps(project, { source: "none" }, { fs: EMPTY_FS }),
        ),
      ).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
    });
  });
});

describe("keyContextHandler: a glossary that cannot be read", () => {
  it("answers with an empty glossary and a notice, keeping the key's values", async () => {
    await withProject({ targetLocales: ["de"] }, async (project) => {
      const glossaryPath = join(project.root, "glossary.json");
      await writeFile(glossaryPath, "{ not json sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "utf8");

      const result = await keyContextHandler(
        { locale: "de", key: "greeting", draft: "Leg es in den Korb" },
        deps(project, { source: "file", path: glossaryPath }),
      );

      expect(result).toMatchObject({
        source: "Add it to your cart",
        target: "Leg es in den Korb",
        glossary: { terms: [], doNotTranslate: [] },
        glossaryNotice: { code: expect.any(String), message: expect.any(String) },
      });
      expect(JSON.stringify(result)).not.toContain("sk-ant-api03");
    });
  });

  it("names a failure without a code generically", async () => {
    await withProject({ targetLocales: ["de"] }, async (project) => {
      const glossaryPath = join(project.root, "glossary.json");
      const fs: SdkFs = {
        ...EMPTY_FS,
        fileExists: async () => true,
        readFileBounded: async (path) => {
          if (path === glossaryPath) {
            throw "not an error";
          }
          try {
            return { kind: "ok", content: await readFile(path, "utf8") };
          } catch {
            return { kind: "missing" };
          }
        },
      };
      const result = await keyContextHandler(
        { locale: "de", key: "title" },
        deps(project, { source: "file", path: glossaryPath }, { fs }),
      ).catch((error: unknown) => error);

      expect(result).toMatchObject({
        glossaryNotice: { code: "GLOSSARY_UNREADABLE", message: "not an error" },
      });
    });
  });
});
