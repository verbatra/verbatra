import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type BundleImport = { path: string; kind: string; external?: boolean };

type BundleResult = {
  metafile: { outputs: Record<string, { imports: BundleImport[] }> };
};

type Esbuild = { build: (options: Record<string, unknown>) => Promise<BundleResult> };

const DOCS_DIR = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_CONFIG = join(DOCS_DIR, "source.config.ts");

const manifest: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} = JSON.parse(readFileSync(join(DOCS_DIR, "package.json"), "utf8"));

const WORKSPACE_PACKAGES = Object.entries({
  ...manifest.dependencies,
  ...manifest.devDependencies,
})
  .filter(([, spec]) => spec.startsWith("workspace:"))
  .map(([name]) => name);

function fumadocsEsbuild(): Esbuild {
  const requireFromDocs = createRequire(join(DOCS_DIR, "package.json"));
  return createRequire(requireFromDocs.resolve("fumadocs-mdx/package.json"))("esbuild");
}

async function postinstallImports(): Promise<BundleImport[]> {
  const result = await fumadocsEsbuild().build({
    entryPoints: [SOURCE_CONFIG],
    outfile: join(DOCS_DIR, ".source/source.config.mjs"),
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    logLevel: "silent",
  });
  return Object.values(result.metafile.outputs).flatMap((output) => output.imports);
}

function isWorkspacePackage(path: string): boolean {
  return WORKSPACE_PACKAGES.some((name) => path === name || path.startsWith(`${name}/`));
}

describe("the source config fumadocs-mdx evaluates on postinstall", () => {
  it("is bundled the way fumadocs-mdx bundles it, with packages left as top-level imports", async () => {
    const imports = await postinstallImports();
    expect(WORKSPACE_PACKAGES).toContain("@verbatra/cli");
    expect(imports).toContainEqual(
      expect.objectContaining({ path: "fumadocs-mdx/config", kind: "import-statement" }),
    );
  });

  it("imports no workspace package at module evaluation, since a clean install has built no dist yet", async () => {
    const eager = (await postinstallImports()).filter(
      (entry) => entry.kind !== "dynamic-import" && isWorkspacePackage(entry.path),
    );
    expect(eager).toEqual([]);
  });

  it("still loads @verbatra/cli for the install link, lazily, when a page compiles", async () => {
    expect(await postinstallImports()).toContainEqual(
      expect.objectContaining({ path: "@verbatra/cli", kind: "dynamic-import" }),
    );
  });
});
