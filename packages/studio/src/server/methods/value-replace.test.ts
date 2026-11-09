import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
