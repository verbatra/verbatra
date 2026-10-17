import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { loadConfig, loadConfigWithMeta } from "./load-config.js";

async function makeNestedDir(root: string, ...segments: string[]): Promise<string> {
  const dir = join(root, ...segments);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("loadConfig upward search: crosses into a parent directory", () => {
  it("finds a config in a repo-root ancestor when the nested cwd has none", async () => {
    const repoRoot = await makeTempDir();
    await mkdir(join(repoRoot, ".git"), { recursive: true });
    await writeFile(
      join(repoRoot, ".verbatrarc.json"),
      JSON.stringify(baseConfig({ sourceLocale: "en", targetLocales: ["fr"] })),
      "utf8",
    );
    const nested = await makeNestedDir(repoRoot, "packages", "app");

    const loaded = await loadConfigWithMeta({ cwd: nested });

    expect(loaded.config.targetLocales).toEqual(["fr"]);
    expect(loaded.source).toMatchObject({
      kind: "search",
      filepath: join(repoRoot, ".verbatrarc.json"),
    });
  });

  it("finds a config two directories up, not just the immediate parent", async () => {
    const repoRoot = await makeTempDir();
    await mkdir(join(repoRoot, ".git"), { recursive: true });
    await writeFile(
      join(repoRoot, "verbatra.config.ts"),
      `export default ${JSON.stringify(baseConfig({ sourceLocale: "de", targetLocales: ["fr"] }))};`,
      "utf8",
    );
    const nested = await makeNestedDir(repoRoot, "apps", "web", "src");

    const config = await loadConfig({ cwd: nested });

    expect(config.sourceLocale).toBe("de");
  });
});

describe("loadConfig upward search: stops at the nearest .git boundary", () => {
  it("does not find a config placed above the repository root", async () => {
    const outer = await makeTempDir();
    await writeFile(
      join(outer, "verbatra.config.ts"),
      `export default ${JSON.stringify(baseConfig({ sourceLocale: "should-not-be-found" }))};`,
      "utf8",
    );
    const repoRoot = await makeNestedDir(outer, "repo");
    await mkdir(join(repoRoot, ".git"), { recursive: true });
    const nested = await makeNestedDir(repoRoot, "packages", "app");

    await expect(loadConfig({ cwd: nested })).rejects.toMatchObject({ code: "CONFIG_NOT_FOUND" });
  });

  it("finds the repo-root config, not the decoy config above it", async () => {
    const outer = await makeTempDir();
    await writeFile(
      join(outer, "verbatra.config.ts"),
      `export default ${JSON.stringify(baseConfig({ sourceLocale: "it" }))};`,
      "utf8",
    );
    const repoRoot = await makeNestedDir(outer, "repo");
    await mkdir(join(repoRoot, ".git"), { recursive: true });
    await writeFile(
      join(repoRoot, ".verbatrarc.json"),
      JSON.stringify(baseConfig({ sourceLocale: "fr" })),
      "utf8",
    );
    const nested = await makeNestedDir(repoRoot, "packages", "app");

    const config = await loadConfig({ cwd: nested });

    expect(config.sourceLocale).toBe("fr");
  });
});

describe("loadConfig upward search: single-directory behavior is unchanged", () => {
  it("still finds a config placed directly in cwd when cwd is itself the repo root", async () => {
    const repoRoot = await makeTempDir();
    await mkdir(join(repoRoot, ".git"), { recursive: true });
    await writeFile(
      join(repoRoot, ".verbatrarc.json"),
      JSON.stringify(baseConfig({ sourceLocale: "en" })),
      "utf8",
    );

    const config = await loadConfig({ cwd: repoRoot });

    expect(config.sourceLocale).toBe("en");
  });

  it("still finds a config placed directly in cwd when there is no .git ancestor at all", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, ".verbatrarc.json"),
      JSON.stringify(baseConfig({ sourceLocale: "en" })),
      "utf8",
    );

    const config = await loadConfig({ cwd: dir });

    expect(config.sourceLocale).toBe("en");
  });

  it("still reports CONFIG_NOT_FOUND when no config exists anywhere reachable", async () => {
    const dir = await makeTempDir();

    await expect(loadConfig({ cwd: dir })).rejects.toMatchObject({ code: "CONFIG_NOT_FOUND" });
  });
});
