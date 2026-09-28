import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editEntry, type LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { reviewApproveHandler } from "./review-decision.js";
import { reviewQueueHandler } from "./review-queue.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

async function agentProject(): Promise<FixtureProject> {
  const project = await makeFixtureProject(
    { targetLocales: ["de"] },
    { greeting: "hello", farewell: "bye" },
  );
  for (const [key, value] of [
    ["greeting", "hallo"],
    ["farewell", "tschuss"],
  ] as const) {
    await editEntry({
      config: project.config,
      cwd: project.root,
      locale: "de",
      key,
      value,
      actor: "agent",
    });
  }
  return project;
}

const AGENT = { origin: "agent", reviewState: "unreviewed" } as const;

describe("reviewQueueHandler", () => {
  it("lists every unapproved machine-class value from the committed files", async () => {
    const project = await agentProject();
    try {
      expect(await reviewQueueHandler({}, deps(project))).toEqual({
        available: true,
        locales: [
          {
            locale: "de",
            needsReview: [
              { key: "greeting", reasons: [], provenance: AGENT },
              { key: "farewell", reasons: [], provenance: AGENT },
            ],
          },
        ],
      });
    } finally {
      await project.cleanup();
    }
  });

  it("lists the approved values too when asked", async () => {
    const project = await agentProject();
    try {
      await reviewApproveHandler(
        { locale: "de", key: "greeting", expectedValue: "hallo", reviewer: "mk" },
        deps(project),
      );

      const result = await reviewQueueHandler({ includeApproved: true }, deps(project));

      expect(result).toMatchObject({
        available: true,
        locales: [
          {
            needsReview: [{ key: "farewell" }],
            approved: [
              {
                key: "greeting",
                provenance: { origin: "agent", reviewState: "approved", reviewer: "mk" },
              },
            ],
          },
        ],
      });
    } finally {
      await project.cleanup();
    }
  });

  it("reports available: false when the provenance file cannot be read", async () => {
    const project = await agentProject();
    try {
      await writeFile(join(project.root, "verbatra.provenance.json"), "{ not json", "utf8");

      expect(await reviewQueueHandler({}, deps(project))).toEqual({
        available: false,
        reason: "provenance-unreadable",
      });
    } finally {
      await project.cleanup();
    }
  });
});
