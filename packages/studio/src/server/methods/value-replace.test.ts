import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRegistry } from "@verbatra/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { criteriaFieldOf } from "../../client/value-replace.js";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";

const seen = vi.hoisted(() => ({ applyInputs: [] as unknown[] }));

vi.mock("@verbatra/sdk", async (importOriginal) => {
  const original = await importOriginal<typeof import("@verbatra/sdk")>();
  return {
    ...original,
    applyValueReplace: (input: unknown, deps: unknown) => {
      seen.applyInputs.push(input);
      return (original.applyValueReplace as (i: unknown, d: unknown) => unknown)(input, deps);
    },
  };
});

const { applyValueReplaceHandler, previewValueReplaceHandler } = await import("./value-replace.js");

function deps(project: FixtureProject): RpcHandlerDeps {
  return {
    config: { config: project.config, source: { kind: "override" }, glossary: { source: "none" } },
    projectRoot: project.root,
  };
}

async function withTarget(
  entries: Readonly<Record<string, string>>,
  source: Readonly<Record<string, string>> = { greeting: "hello world", bye: "bye" },
): Promise<FixtureProject> {
  const project = await makeFixtureProject({}, source);
  await mkdir(join(project.root, "locales"), { recursive: true });
  await writeFile(
    join(project.root, "locales", "de.json"),
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );
  return project;
}

afterEach(() => {
  seen.applyInputs.length = 0;
});

describe("injected sdk dependencies", () => {
  it("routes the preview through the injected file system and adapter registry", async () => {
    const project = await withTarget({ greeting: "Hallo Welt", bye: "Tschuess" });
    const reads: string[] = [];
    const registry = createDefaultRegistry();
    try {
      const preview = await previewValueReplaceHandler(
        { find: "Welt", replace: "Erde" },
        {
          ...deps(project),
          fs: {
            fileExists: async (path) => {
              try {
                await access(path);
                return true;
              } catch {
                return false;
              }
            },
            readFileBounded: async (path) => {
              reads.push(path);
              try {
                return { kind: "ok", content: await readFile(path, "utf8") };
              } catch {
                return { kind: "missing" };
              }
            },
            readBytesBounded: async () => ({ kind: "missing" }),
            writeFile: async () => {},
            writeBytes: async () => {},
            createExclusive: async () => false,
            deleteFile: async () => {},
          },
          adapterRegistry: registry,
        },
      );

      expect(preview.entries).toHaveLength(1);
      expect(reads.length).toBeGreaterThan(0);
    } finally {
      await project.cleanup();
    }
  });
});

describe("translation.previewValueReplace handler", () => {
  it("lists a matching value with its hash and excerpts, and leaves the file alone", async () => {
    const project = await withTarget({ greeting: "Hallo Welt", bye: "Tschuess" });
    try {
      const preview = await previewValueReplaceHandler(
        { find: "Welt", replace: "Erde" },
        deps(project),
      );

      expect(preview.entries).toHaveLength(1);
      expect(preview.entries[0]).toMatchObject({
        locale: "de",
        key: "greeting",
        status: "ready",
        before: "Hallo Welt",
        after: "Hallo Erde",
      });
      expect(await readFile(join(project.root, "locales", "de.json"), "utf8")).toContain("Welt");
    } finally {
      await project.cleanup();
    }
  });

  it("refuses an empty find as FIND_TEXT_INVALID", async () => {
    const project = await withTarget({ greeting: "Hallo Welt" });
    try {
      await expect(
        previewValueReplaceHandler({ find: "", replace: "x" }, deps(project)),
      ).rejects.toMatchObject({ code: "FIND_TEXT_INVALID" });
    } finally {
      await project.cleanup();
    }
  });
});

describe("translation.applyValueReplaceHandler", () => {
  it("passes the constant human actor to the sdk and records human as the origin", async () => {
    const project = await withTarget({ greeting: "Hallo Welt" });
    try {
      const preview = await previewValueReplaceHandler(
        { find: "Welt", replace: "Erde" },
        deps(project),
      );
      const entry = preview.entries[0];
      if (entry === undefined) {
        throw new Error("expected one preview entry");
      }

      const result = await applyValueReplaceHandler(
        {
          find: "Welt",
          replace: "Erde",
          entries: [{ locale: "de", key: "greeting", valueHash: entry.valueHash }],
        },
        deps(project),
      );

      expect(seen.applyInputs).toHaveLength(1);
      expect(seen.applyInputs[0]).toMatchObject({ actor: "human" });
      expect(result.outcomes).toEqual([
        { locale: "de", key: "greeting", status: "applied", staleSource: false },
      ]);
      expect(await readFile(join(project.root, "locales", "de.json"), "utf8")).toContain(
        "Hallo Erde",
      );
      const provenance = await readFile(join(project.root, "verbatra.provenance.json"), "utf8");
      expect(provenance).toContain('"human"');
    } finally {
      await project.cleanup();
    }
  });

  it("recomputes from the current value: a stale hash from the client changes nothing", async () => {
    const project = await withTarget({ greeting: "Hallo Welt" });
    try {
      const result = await applyValueReplaceHandler(
        {
          find: "Welt",
          replace: "Erde",
          entries: [{ locale: "de", key: "greeting", valueHash: "0000000000000000" }],
        },
        deps(project),
      );

      expect(result.outcomes).toEqual([{ locale: "de", key: "greeting", status: "changed" }]);
      expect(await readFile(join(project.root, "locales", "de.json"), "utf8")).toContain(
        "Hallo Welt",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("inserts $& and $1 literally", async () => {
    const project = await withTarget({ greeting: "Hallo Welt" });
    try {
      const preview = await previewValueReplaceHandler(
        { find: "Welt", replace: "$&-$1" },
        deps(project),
      );
      const entry = preview.entries[0];
      await applyValueReplaceHandler(
        {
          find: "Welt",
          replace: "$&-$1",
          entries: [{ locale: "de", key: "greeting", valueHash: entry?.valueHash ?? "" }],
        },
        deps(project),
      );

      expect(await readFile(join(project.root, "locales", "de.json"), "utf8")).toContain(
        "Hallo $&-$1",
      );
    } finally {
      await project.cleanup();
    }
  });
});

async function withGatedProject(): Promise<FixtureProject> {
  const project = await makeFixtureProject(
    { targetLocales: ["de", "fr"], pinnedKeys: ["pinnedKey"] },
    { plainKey: "world", pinnedKey: "world pin", protectedKey: "world prot" },
  );
  const target = {
    plainKey: "Hallo Welt",
    pinnedKey: "Hallo Welt pin",
    protectedKey: "Hallo Welt prot",
  };
  for (const locale of ["de", "fr"]) {
    await writeFile(
      join(project.root, "locales", `${locale}.json`),
      `${JSON.stringify(target, null, 2)}\n`,
      "utf8",
    );
  }
  const { editEntry } = await import("@verbatra/sdk");
  for (const key of ["plainKey", "pinnedKey", "protectedKey"]) {
    const value = (target as Record<string, string>)[key] ?? "";
    for (const locale of ["de", "fr"]) {
      await editEntry({
        config: project.config,
        cwd: project.root,
        locale,
        key,
        value,
        actor: key === "plainKey" ? "agent" : "human",
      });
    }
  }
  return project;
}

async function previewHashes(
  project: FixtureProject,
  find: string,
): Promise<{ locale: string; key: string; valueHash: string }[]> {
  const preview = await previewValueReplaceHandler(
    { find, replace: "Erde", caseSensitive: false },
    deps(project),
  );
  return preview.entries.map((item) => ({
    locale: item.locale,
    key: item.key,
    valueHash: item.valueHash,
  }));
}

async function deValues(project: FixtureProject): Promise<Record<string, string>> {
  return JSON.parse(await readFile(join(project.root, "locales", "de.json"), "utf8"));
}

describe("handler forwards every option to the sdk", () => {
  it("changes a pinned key only when includePinned is sent (a human-written one also needs includeProtected)", async () => {
    const project = await withGatedProject();
    try {
      const entries = await previewHashes(project, "welt");
      const without = await applyValueReplaceHandler(
        { find: "welt", replace: "Erde", caseSensitive: false, entries },
        deps(project),
      );
      expect(
        without.outcomes.find((o) => o.key === "pinnedKey" && o.locale === "de"),
      ).toMatchObject({ status: "skipped", reason: "pinned" });
      expect((await deValues(project)).pinnedKey).toBe("Hallo Welt pin");

      await applyValueReplaceHandler(
        {
          find: "welt",
          replace: "Erde",
          caseSensitive: false,
          entries,
          includePinned: true,
          includeProtected: true,
        },
        deps(project),
      );
      expect((await deValues(project)).pinnedKey).toBe("Hallo Erde pin");
    } finally {
      await project.cleanup();
    }
  });

  it("changes a protected value only when includeProtected is sent", async () => {
    const project = await withGatedProject();
    try {
      const entries = await previewHashes(project, "welt");
      await applyValueReplaceHandler(
        { find: "welt", replace: "Erde", caseSensitive: false, entries },
        deps(project),
      );
      expect((await deValues(project)).protectedKey).toBe("Hallo Welt prot");

      await applyValueReplaceHandler(
        { find: "welt", replace: "Erde", caseSensitive: false, entries, includeProtected: true },
        deps(project),
      );
      expect((await deValues(project)).protectedKey).toBe("Hallo Erde prot");
      expect((await deValues(project)).pinnedKey).toBe("Hallo Welt pin");
    } finally {
      await project.cleanup();
    }
  });

  it("honours caseSensitive and the locale list on preview", async () => {
    const project = await withGatedProject();
    try {
      const sensitive = await previewValueReplaceHandler(
        { find: "welt", replace: "Erde", caseSensitive: true },
        deps(project),
      );
      const insensitive = await previewValueReplaceHandler(
        { find: "welt", replace: "Erde", caseSensitive: false },
        deps(project),
      );
      const frOnly = await previewValueReplaceHandler(
        { find: "Welt", replace: "Erde", locales: ["fr"] },
        deps(project),
      );

      expect(sensitive.entries).toHaveLength(0);
      expect(insensitive.entries.length).toBeGreaterThan(0);
      expect(new Set(frOnly.entries.map((item) => item.locale))).toEqual(new Set(["fr"]));
    } finally {
      await project.cleanup();
    }
  });

  it("honours caseSensitive on apply", async () => {
    const project = await withGatedProject();
    try {
      const entries = await previewHashes(project, "welt");
      const result = await applyValueReplaceHandler(
        { find: "welt", replace: "Erde", caseSensitive: true, entries },
        deps(project),
      );

      expect(result.outcomes.every((outcome) => outcome.status === "changed")).toBe(true);
      expect((await deValues(project)).plainKey).toBe("Hallo Welt");
    } finally {
      await project.cleanup();
    }
  });
});

describe("criteriaFieldOf against the real sdk messages", () => {
  async function failureOf(
    find: string,
    replace: string,
  ): Promise<{ code: string; message: string }> {
    const project = await withTarget({ greeting: "Hallo Welt" });
    try {
      await previewValueReplaceHandler({ find, replace }, deps(project));
    } catch (error) {
      const { code, message } = error as { code: string; message: string };
      return { code, message };
    } finally {
      await project.cleanup();
    }
    throw new Error("the sdk accepted the criteria");
  }

  it.each([
    ["an empty find", "", "x", "find"],
    ["a find over the cap", "x".repeat(20_001), "x", "find"],
    ["a find with a lone surrogate", "\uD800", "x", "find"],
    ["a replace with a lone surrogate", "Welt", "\uD800", "replace"],
  ] as const)("maps %s to the %s field", async (_name, find, replace, field) => {
    const failure = await failureOf(find, replace);

    expect(failure.code).toBe("FIND_TEXT_INVALID");
    expect(criteriaFieldOf(failure)).toBe(field);
  });
});
