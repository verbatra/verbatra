import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRegistry, SdkError, type SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import {
  CONFIG_KEY_REFUSAL,
  keySetMaxLengthHandler,
  nextStepFor,
  withoutCliStep,
} from "./key-set-max-length.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  return {
    config: { config: project.config, source: { kind: "override" }, glossary: { source: "none" } },
    projectRoot: project.root,
  };
}

function limitsPath(project: FixtureProject): string {
  return join(project.root, "verbatra.limits.json");
}

async function limitsOnDisk(project: FixtureProject): Promise<unknown> {
  return JSON.parse(await readFile(limitsPath(project), "utf8"));
}

describe("keySetMaxLengthHandler", () => {
  it("sets, changes and removes a limit in the limits file", async () => {
    const project = await makeFixtureProject({}, { greeting: "hello", bye: "bye" });
    try {
      expect(
        await keySetMaxLengthHandler({ key: "greeting", maxLength: 12 }, deps(project)),
      ).toEqual({ key: "greeting", maxLength: 12, changed: true });
      await keySetMaxLengthHandler({ key: "greeting", maxLength: 20 }, deps(project));
      await keySetMaxLengthHandler({ key: "bye", maxLength: 3 }, deps(project));
      expect(await limitsOnDisk(project)).toEqual({
        version: 1,
        maxLength: { bye: 3, greeting: 20 },
      });

      const removed = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: null },
        deps(project),
      );

      expect(removed).toEqual({ key: "greeting", maxLength: null, changed: true });
      expect(await limitsOnDisk(project)).toEqual({ version: 1, maxLength: { bye: 3 } });
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a key the config sets itself, naming the start-time snapshot, and writes nothing", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } });
    try {
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 12 }, deps(project)),
      ).rejects.toMatchObject({ name: "SdkError", code: "LENGTH_LIMIT_INVALID" });
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 12 }, deps(project)),
      ).rejects.toThrow(/started/);
      await expect(readFile(limitsPath(project), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await project.cleanup();
    }
  });

  it("lets a shadowed limits-file entry of a config-set key be removed, as the sdk does", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } });
    await writeFile(
      limitsPath(project),
      `${JSON.stringify({ version: 1, maxLength: { greeting: 9 } })}\n`,
    );
    try {
      const result = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: null },
        deps(project),
      );

      expect(result).toEqual({ key: "greeting", maxLength: null, changed: true });
      expect(await limitsOnDisk(project)).toEqual({ version: 1, maxLength: {} });
    } finally {
      await project.cleanup();
    }
  });

  it("gives the refusal as Studio's own text alone, with no sdk hint repeated after it", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } });
    try {
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 12 }, deps(project)),
      ).rejects.toMatchObject({ code: "LENGTH_LIMIT_INVALID", message: CONFIG_KEY_REFUSAL });
    } finally {
      await project.cleanup();
    }
  });

  it("adds the sdk next step to a refusal that has none, exactly once", async () => {
    const project = await makeFixtureProject();
    await writeFile(limitsPath(project), "{ not json");
    try {
      const failure = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: 5 },
        deps(project),
      ).catch((error: Error) => error);

      const text = (failure as Error).message;
      expect(text.match(/Restore verbatra\.limits\.json from version control/g)).toHaveLength(1);
    } finally {
      await project.cleanup();
    }
  });

  it("adds no second next step to a refusal that describes itself", async () => {
    const project = await makeFixtureProject();
    try {
      const failure = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: 0 },
        deps(project),
      ).catch((error: Error) => error);

      expect((failure as Error).message).not.toContain("Pass a whole number");
    } finally {
      await project.cleanup();
    }
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "gives one next step, in Studio's words, when the limits lock cannot be written",
    async () => {
      const project = await makeFixtureProject();
      await chmod(project.root, 0o555);
      try {
        const failure = await keySetMaxLengthHandler(
          { key: "greeting", maxLength: 5 },
          deps(project),
        ).catch((error: Error) => error);

        const text = (failure as Error).message;
        expect(text).toContain("Could not write the limits write lock");
        expect(text).toContain("(EACCES)");
        expect(text).not.toContain("run again");
        expect(text.match(/Check the (write )?permissions/g)).toHaveLength(1);
      } finally {
        await chmod(project.root, 0o755);
        await project.cleanup();
      }
    },
  );

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "gives one next step, in Studio's words, when the limits file cannot be written",
    async () => {
      const project = await makeFixtureProject();
      await mkdir(join(project.root, ".verbatra-local"));
      await chmod(project.root, 0o555);
      try {
        const failure = await keySetMaxLengthHandler(
          { key: "greeting", maxLength: 5 },
          deps(project),
        ).catch((error: Error) => error);

        const text = (failure as Error).message;
        expect(text).toContain("Could not write the limits file verbatra.limits.json (EACCES).");
        expect(text).not.toContain("run again");
        expect(text.match(/Check the (write )?permissions/g)).toHaveLength(1);
      } finally {
        await chmod(project.root, 0o755);
        await project.cleanup();
      }
    },
  );

  it("drops only the run-again advice of a write failure and keeps the facts", () => {
    expect(
      withoutCliStep(
        "Could not write the limits file verbatra.limits.json (EACCES). Check the write permissions on the containing directory, then run again.",
      ),
    ).toBe("Could not write the limits file verbatra.limits.json (EACCES).");
    expect(
      withoutCliStep(
        "Could not write the limits file verbatra.limits.json (EROFS). That file system is mounted read-only, so nothing can be written there.",
      ),
    ).toBe(
      "Could not write the limits file verbatra.limits.json (EROFS). That file system is mounted read-only, so nothing can be written there.",
    );
    expect(
      withoutCliStep(
        "Could not write the limits write lock .verbatra-local/locks/_limits.lock (EACCES). Check that the containing directory exists and is writable, then run again. The limit was saved, but the lock could not be released.",
      ),
    ).toBe(
      "Could not write the limits write lock .verbatra-local/locks/_limits.lock (EACCES). The limit was saved, but the lock could not be released.",
    );
  });

  it("does not read the config for an inherited key name", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } }, { constructor: "x" });
    try {
      expect(
        await keySetMaxLengthHandler({ key: "constructor", maxLength: 4 }, deps(project)),
      ).toEqual({ key: "constructor", maxLength: 4, changed: true });
    } finally {
      await project.cleanup();
    }
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])(
    "refuses the limit %s through the sdk",
    async (value) => {
      const project = await makeFixtureProject();
      try {
        await expect(
          keySetMaxLengthHandler({ key: "greeting", maxLength: value }, deps(project)),
        ).rejects.toMatchObject({ code: "LENGTH_LIMIT_INVALID" });
      } finally {
        await project.cleanup();
      }
    },
  );

  it("accepts the largest safe whole number", async () => {
    const project = await makeFixtureProject();
    try {
      const result = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: Number.MAX_SAFE_INTEGER },
        deps(project),
      );

      expect(result.maxLength).toBe(Number.MAX_SAFE_INTEGER);
    } finally {
      await project.cleanup();
    }
  });

  it.each([
    ["a key that is not in the source", "missing", "UNKNOWN_KEY"],
    ["a key of 100000 characters", "k".repeat(100_000), "LENGTH_LIMIT_INVALID"],
  ])("refuses %s", async (_name, key, code) => {
    const project = await makeFixtureProject();
    try {
      await expect(
        keySetMaxLengthHandler({ key, maxLength: 5 }, deps(project)),
      ).rejects.toMatchObject({ code });
      await expect(readFile(limitsPath(project), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await project.cleanup();
    }
  });

  it("refuses to overwrite an invalid limits file and appends the hint", async () => {
    const project = await makeFixtureProject();
    await writeFile(limitsPath(project), "{ not json");
    try {
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 5 }, deps(project)),
      ).rejects.toThrow(/Restore verbatra\.limits\.json from version control/);
      expect(await readFile(limitsPath(project), "utf8")).toBe("{ not json");
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a directory at the limits path as unusable", async () => {
    const project = await makeFixtureProject();
    await mkdir(limitsPath(project));
    try {
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 5 }, deps(project)),
      ).rejects.toMatchObject({ code: "LIMITS_FILE_UNUSABLE" });
    } finally {
      await rm(limitsPath(project), { recursive: true, force: true });
      await project.cleanup();
    }
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports a project directory the process cannot write as unwritable",
    async () => {
      const project = await makeFixtureProject();
      await chmod(project.root, 0o555);
      try {
        await expect(
          keySetMaxLengthHandler({ key: "greeting", maxLength: 5 }, deps(project)),
        ).rejects.toMatchObject({ code: "LIMITS_FILE_UNWRITABLE" });
      } finally {
        await chmod(project.root, 0o755);
        await project.cleanup();
      }
    },
  );

  it("uses the adapter registry it is given", async () => {
    const project = await makeFixtureProject();
    try {
      const result = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: 6 },
        { ...deps(project), adapterRegistry: createDefaultRegistry() },
      );

      expect(result).toEqual({ key: "greeting", maxLength: 6, changed: true });
    } finally {
      await project.cleanup();
    }
  });

  it("passes a failure that is not an sdk error through unchanged and unhinted", async () => {
    const project = await makeFixtureProject();
    const boom = new TypeError("disk on fire");
    const failing = new Proxy({} as SdkFs, {
      get: () => async () => {
        throw boom;
      },
    });
    try {
      await expect(
        keySetMaxLengthHandler(
          { key: "greeting", maxLength: 6 },
          { ...deps(project), fs: failing },
        ),
      ).rejects.toBe(boom);
    } finally {
      await project.cleanup();
    }
  });

  describe("nextStepFor", () => {
    const writeFailure = (cause: string, remedy: string): SdkError =>
      new SdkError(
        "LIMITS_FILE_UNWRITABLE",
        `Could not write the limits file verbatra.limits.json (${cause}). ${remedy}`,
      );

    it.each([
      ["EACCES", "Check the write permissions on the containing directory, then run again."],
      ["EPERM", "Check the write permissions on the containing directory, then run again."],
    ])("gives the permissions step for %s", (cause, remedy) => {
      expect(nextStepFor(writeFailure(cause, remedy))).toContain(
        "Check the permissions of verbatra.limits.json",
      );
    });

    it.each([
      ["ENOSPC", "The device it lives on has no space left."],
      ["EROFS", "That file system is mounted read-only, so nothing can be written there."],
      ["EISDIR", "A directory already exists at that path, so no file can take its place."],
      ["ENOENT", "Check that the containing directory exists and is reachable, then run again."],
    ])("gives no permissions step for %s", (cause, remedy) => {
      expect(nextStepFor(writeFailure(cause, remedy))).toBeUndefined();
    });

    it("gives no permissions step for a write failure with no cause code", () => {
      const error = new SdkError(
        "LIMITS_FILE_UNWRITABLE",
        "Could not write the limits file verbatra.limits.json. Check that the containing directory exists and is writable, then run again.",
      );

      expect(nextStepFor(error)).toBeUndefined();
    });

    it("shows a non-permission cause with its own remedy and no permissions step, end to end", () => {
      const shown = [
        "Could not write the limits file verbatra.limits.json (EROFS). That file system is mounted read-only, so nothing can be written there.",
        nextStepFor(
          new SdkError(
            "LIMITS_FILE_UNWRITABLE",
            "Could not write the limits file verbatra.limits.json (EROFS). That file system is mounted read-only, so nothing can be written there.",
          ),
        ),
      ]
        .filter(Boolean)
        .join(" ");

      expect(shown).toContain("mounted read-only");
      expect(shown).not.toContain("Check the permissions");
    });

    it("still gives the sdk step for a refusal that is not a write failure", () => {
      const error = new SdkError("LIMITS_FILE_UNUSABLE", "verbatra.limits.json is not valid JSON.");

      expect(nextStepFor(error)).toContain("Restore verbatra.limits.json");
    });
  });
});
