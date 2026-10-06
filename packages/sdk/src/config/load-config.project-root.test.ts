import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { check } from "../flow/check.js";
import { dataFlow } from "../flow/data-flow.js";
import { doctor } from "../flow/doctor.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { loadConfig, loadConfigWithMeta, resolveProjectRoot } from "./load-config.js";

interface NestedProject {
  readonly root: string;
  readonly nested: string;
}

async function makeNestedProject(): Promise<NestedProject> {
  const root = await makeTempDir();
  await mkdir(join(root, ".git"), { recursive: true });
  await mkdir(join(root, "locales"), { recursive: true });
  await writeJsonFile(
    join(root, ".verbatrarc.json"),
    baseConfig({ provider: { id: "none", options: {} } }),
  );
  await writeJsonFile(join(root, "locales", "en.json"), { hello: "Hello", bye: "Bye" });
  await writeJsonFile(join(root, "locales", "de.json"), { hello: "Hallo" });
  const nested = join(root, "src", "components");
  await mkdir(join(nested, "locales"), { recursive: true });
  await writeJsonFile(join(nested, "locales", "en.json"), { decoy: "Decoy" });
  await writeJsonFile(join(nested, "locales", "de.json"), { decoy: "Attrappe" });
  return { root, nested };
}

describe("resolveProjectRoot", () => {
  it("roots a config the search found at the config file's directory", () => {
    expect(
      resolveProjectRoot({ kind: "search", filepath: "/repo/verbatra.config.ts" }, "/repo/src"),
    ).toBe("/repo");
  });

  it("keeps the working directory for an explicit config file", () => {
    expect(
      resolveProjectRoot({ kind: "explicit", filepath: "/configs/verbatra.json" }, "/repo/src"),
    ).toBe("/repo/src");
  });

  it("keeps the working directory for an in-memory config", () => {
    expect(resolveProjectRoot({ kind: "override" }, "/repo/src")).toBe("/repo/src");
  });
});

describe("a project loaded from a nested directory", () => {
  it("resolves the locale files against the directory of the config the search found", async () => {
    const { root, nested } = await makeNestedProject();

    const loaded = await loadConfigWithMeta({ cwd: nested });
    const projectRoot = resolveProjectRoot(loaded.source, nested);
    const summary = await check({ config: loaded.config, cwd: projectRoot });

    expect(projectRoot).toBe(root);
    expect(summary.locales[0]).toMatchObject({ locale: "de", missing: 1, upToDate: 1 });
  });

  it("lets a flow given the loaded config and no cwd read the files next to the config", async () => {
    const { nested } = await makeNestedProject();

    const summary = await check({ config: await loadConfig({ cwd: nested }) });

    expect(summary.locales[0]).toMatchObject({ locale: "de", missing: 1, upToDate: 1 });
  });

  it("roots a nested package's own config at that package, not at the repository's config", async () => {
    const { root } = await makeNestedProject();
    const pkg = join(root, "packages", "a");
    await mkdir(join(pkg, "locales"), { recursive: true });
    await mkdir(join(pkg, "src"), { recursive: true });
    await writeJsonFile(
      join(pkg, ".verbatrarc.json"),
      baseConfig({ provider: { id: "none", options: {} }, targetLocales: ["fr"] }),
    );
    await writeJsonFile(join(pkg, "locales", "en.json"), { title: "Title" });
    await writeJsonFile(join(pkg, "locales", "fr.json"), { title: "Titre" });

    const summary = await check({ config: await loadConfig({ cwd: join(pkg, "src") }) });

    expect(summary.locales[0]).toMatchObject({ locale: "fr", missing: 0, upToDate: 1 });
  });

  it("keeps the load's cwd for an explicit config file given to a flow without a cwd", async () => {
    const { root, nested } = await makeNestedProject();

    const config = await loadConfig({ cwd: nested, configPath: join(root, ".verbatrarc.json") });
    const summary = await check({ config });

    expect(summary.locales[0]).toMatchObject({ locale: "de", missing: 0, upToDate: 1 });
  });

  it("lets doctor find the source locale file next to the config", async () => {
    const { nested } = await makeNestedProject();

    const result = await doctor({ cwd: nested });

    expect(result.checks.find((entry) => entry.id === "source-file")?.status).toBe("pass");
  });

  it("lets the literal scan run from the config's directory", async () => {
    const { nested } = await makeNestedProject();

    const result = await doctor({ cwd: nested, literals: true });

    expect(result.checks.find((entry) => entry.id === "config")?.status).toBe("pass");
  });

  it("counts the project's source strings in the data-flow manifest", async () => {
    const { root, nested } = await makeNestedProject();
    await writeFile(
      join(root, ".verbatrarc.json"),
      JSON.stringify(baseConfig({ provider: { id: "deepl", options: {} } })),
      "utf8",
    );

    const manifest = await dataFlow({ cwd: nested });
    const report = await doctor({ cwd: nested, dataFlow: true });

    expect(manifest.sent.counts).toBeDefined();
    expect(report.dataFlow?.sent.counts).toBeDefined();
  });

  it("keeps an explicit config file rooted at the working directory", async () => {
    const { root, nested } = await makeNestedProject();

    const loaded = await loadConfigWithMeta({
      cwd: nested,
      configPath: join(root, ".verbatrarc.json"),
    });

    expect(resolveProjectRoot(loaded.source, nested)).toBe(nested);
  });
});
