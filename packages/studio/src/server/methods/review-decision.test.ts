import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  editEntry,
  type LoadedConfig,
  loadLockFile,
  loadProvenance,
  type SdkFs,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { reviewApproveHandler, reviewRejectHandler } from "./review-decision.js";

function deps(project: FixtureProject, extra: Partial<RpcHandlerDeps> = {}): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root, ...extra };
}

async function reviewedProject(): Promise<FixtureProject> {
  const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
  await editEntry({
    config: project.config,
    cwd: project.root,
    locale: "de",
    key: "greeting",
    value: "hallo",
    actor: "agent",
  });
  return project;
}

describe("reviewApproveHandler", () => {
  it("records the approval in the provenance file without touching the locale file", async () => {
    const project = await reviewedProject();
    try {
      const before = await readFile(join(project.root, "locales", "de.json"), "utf8");

      const result = await reviewApproveHandler(
        { locale: "de", key: "greeting", expectedValue: "hallo" },
        deps(project),
      );

      expect(result).toEqual({
        locale: "de",
        key: "greeting",
        provenance: { origin: "agent", reviewState: "approved" },
      });
      expect((await loadProvenance({ cwd: project.root })).locales.de?.greeting).toMatchObject({
        reviewState: "approved",
      });
      expect(await readFile(join(project.root, "locales", "de.json"), "utf8")).toBe(before);
    } finally {
      await project.cleanup();
    }
  });

  it("surfaces a stale expected value as REVIEW_VALUE_CHANGED", async () => {
    const project = await reviewedProject();
    try {
      await expect(
        reviewApproveHandler(
          { locale: "de", key: "greeting", expectedValue: "servus" },
          deps(project),
        ),
      ).rejects.toMatchObject({ code: "REVIEW_VALUE_CHANGED" });
    } finally {
      await project.cleanup();
    }
  });
});

describe("reviewRejectHandler", () => {
  it("removes the translation and its lock entry and records the rejection", async () => {
    const project = await reviewedProject();
    try {
      const result = await reviewRejectHandler(
        { locale: "de", key: "greeting", expectedValue: "hallo" },
        deps(project),
      );

      expect(result.provenance).toEqual({ origin: "agent", reviewState: "rejected" });
      expect(JSON.parse(await readFile(join(project.root, "locales", "de.json"), "utf8"))).toEqual(
        {},
      );
      expect((await loadLockFile({ cwd: project.root })).locales.de).toEqual({});
    } finally {
      await project.cleanup();
    }
  });

  it("reads through the injected file system", async () => {
    const project = await reviewedProject();
    try {
      const fs: SdkFs = {
        fileExists: async () => {
          throw new Error("injected fs was used");
        },
        readFileBounded: async () => ({ kind: "missing" }),
        readBytesBounded: async () => ({ kind: "missing" }),
        writeFile: async () => {},
        writeBytes: async () => {},
        createExclusive: async () => true,
        deleteFile: async () => {},
      };

      await expect(
        reviewRejectHandler(
          { locale: "de", key: "greeting", expectedValue: "hallo" },
          deps(project, { fs }),
        ),
      ).rejects.toThrow("injected fs was used");
    } finally {
      await project.cleanup();
    }
  });

  it("resolves the format through the injected adapter registry", async () => {
    const project = await reviewedProject();
    try {
      const adapterRegistry = {
        resolve: () => {
          throw new Error("injected registry was used");
        },
      } as unknown as NonNullable<RpcHandlerDeps["adapterRegistry"]>;

      await expect(
        reviewApproveHandler(
          { locale: "de", key: "greeting", expectedValue: "hallo" },
          deps(project, { adapterRegistry }),
        ),
      ).rejects.toThrow("injected registry was used");
    } finally {
      await project.cleanup();
    }
  });
});
