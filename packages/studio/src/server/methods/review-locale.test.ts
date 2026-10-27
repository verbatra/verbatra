import { editEntry, type LoadedConfig, reviewQueue } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { reviewApproveLocaleHandler } from "./review-locale.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

async function queued(project: FixtureProject): Promise<string[]> {
  const queue = await reviewQueue({ config: project.config, cwd: project.root });
  return queue.available ? queue.locales.flatMap((l) => l.needsReview.map((e) => e.key)) : [];
}

describe("reviewApproveLocaleHandler", () => {
  it("approves the locale's queue through the sdk, narrowed to the requested origins", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "hello", farewell: "bye" },
    );
    try {
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

      const narrowed = await reviewApproveLocaleHandler(
        { locale: "de", origins: ["machine"] },
        deps(project),
      );
      const all = await reviewApproveLocaleHandler({ locale: "de" }, deps(project));

      expect(narrowed).toEqual({ locale: "de", approved: [], sourceChanged: [] });
      expect(all).toEqual({ locale: "de", approved: ["greeting", "farewell"], sourceChanged: [] });
      expect(await queued(project)).toEqual([]);
    } finally {
      await project.cleanup();
    }
  });
});
