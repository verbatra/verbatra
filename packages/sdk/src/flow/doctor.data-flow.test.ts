import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "../test-support.js";
import { dataFlowManifestSchema } from "./data-flow-manifest.js";
import { doctor } from "./doctor.js";

let projectDir: string;

async function writeProject(config: Record<string, unknown>): Promise<void> {
  await writeFile(
    join(projectDir, ".verbatrarc.json"),
    JSON.stringify({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: "m", maxTokens: 1 } },
      ...config,
    }),
    "utf8",
  );
  await mkdir(join(projectDir, "locales"), { recursive: true });
  await writeFile(join(projectDir, "locales", "en.json"), JSON.stringify({ hi: "Hi" }), "utf8");
}

beforeEach(async () => {
  projectDir = await makeTempDir();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(projectDir, { recursive: true, force: true });
});

describe("doctor with dataFlow", () => {
  it("runs only the config and data-flow checks and passes with no key set", async () => {
    await writeProject({});

    const result = await doctor({ cwd: projectDir, dataFlow: true, live: true });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ["config", "pass"],
      ["data-flow", "pass"],
    ]);
    expect(result.checks[1]?.detail).toContain("api.anthropic.com (permitted)");
    expect(dataFlowManifestSchema.safeParse(result.dataFlow).success).toBe(true);
    expect(result.locales).toBeUndefined();
  });

  it("warns, without failing, when the policy refuses the provider's host", async () => {
    await writeProject({ network: { policy: "local-only" } });

    const result = await doctor({ cwd: projectDir, dataFlow: true });

    expect(result.ok).toBe(true);
    expect(result.checks[1]?.status).toBe("warn");
    expect(result.dataFlow?.destinations[0]?.verdict).toBe("refused");
  });

  it("warns when the source file cannot be read for the counts", async () => {
    await writeProject({});
    await rm(join(projectDir, "locales"), { recursive: true });

    const result = await doctor({ cwd: projectDir, dataFlow: true });

    expect(result.checks[1]?.status).toBe("warn");
    expect(result.checks[1]?.detail).toContain("Counts unavailable");
  });

  it("states that nothing is sent for provider none", async () => {
    await writeProject({ provider: { id: "none" } });

    const result = await doctor({ cwd: projectDir, dataFlow: true });

    expect(result.checks[1]?.detail).toContain("Nothing is sent");
    expect(result.dataFlow?.sent.nothing).toBe(true);
  });

  it("fails the config check and skips data-flow when no config is found", async () => {
    const result = await doctor({ cwd: projectDir, dataFlow: true });

    expect(result.ok).toBe(false);
    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ["config", "fail"],
      ["data-flow", "skipped"],
    ]);
    expect(result.dataFlow).toBeUndefined();
  });

  it("lets literals take precedence", async () => {
    await writeProject({});

    const result = await doctor({ cwd: projectDir, dataFlow: true, literals: true });

    expect(result.checks.map((check) => check.id)).toEqual(["config", "untranslated-literals"]);
  });
});
