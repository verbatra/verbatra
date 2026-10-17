import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isBuildOnlyFile,
  isEnvFile,
  removeStandaloneEnvFiles,
  standaloneBuildOnlyFiles,
  tracedBuildOnlyFiles,
} from "./standalone-output.mjs";

const roots: string[] = [];

async function appDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "standalone-output-"));
  roots.push(root);
  return join(root, "apps", "docs");
}

async function put(path: string, body = ""): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

async function trace(app: string, route: string, files: ReadonlyArray<string>): Promise<void> {
  await put(join(app, ".next", "server", "app", `${route}.js.nft.json`), JSON.stringify({ files }));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("isEnvFile", () => {
  it("matches .env and every .env.* name, nothing else", () => {
    expect(isEnvFile("apps/docs/.env")).toBe(true);
    expect(isEnvFile(".env.production")).toBe(true);
    expect(isEnvFile("scripts/playground/.env.local")).toBe(true);
    expect(isEnvFile("lib/env.ts")).toBe(false);
    expect(isEnvFile(".envrc")).toBe(false);
  });
});

describe("isBuildOnlyFile", () => {
  it("flags scripts, coverage, e2e, test output, test files and env files", () => {
    for (const path of [
      "scripts/playground/limits.ts",
      "coverage/index.html",
      "e2e/support.ts",
      "test-results/trace.zip",
      "test-support/resolve-server.ts",
      "lib/site.test.ts",
      "components/hero.test.tsx",
      "e2e/landing.spec.ts",
      ".env",
    ]) {
      expect(isBuildOnlyFile(path), path).toBe(true);
    }
  });

  it("leaves runtime files and dependencies alone", () => {
    for (const path of [
      "assets/og-fonts/inter.ttf",
      ".next/server/app/page.js",
      "lib/scripts.ts",
      "../../node_modules/next/dist/server/next.js",
      "node_modules/vitest/scripts/test.js",
    ]) {
      expect(isBuildOnlyFile(path), path).toBe(false);
    }
  });
});

describe("tracedBuildOnlyFiles", () => {
  it("lists every build-only file a server trace pulls in, relative to the app", async () => {
    const app = await appDir();
    await trace(app, "page", [
      "../../chunks/ssr/page.js",
      "../../../scripts/playground/limits.ts",
      "../../../coverage/index.html",
      "../../../lib/site.test.ts",
      "../../../../../node_modules/next/package.json",
    ]);
    expect(await tracedBuildOnlyFiles(app)).toEqual([
      "coverage/index.html",
      "lib/site.test.ts",
      "scripts/playground/limits.ts",
    ]);
  });

  it("is empty for traces that name only runtime files", async () => {
    const app = await appDir();
    await trace(app, "page", ["../../chunks/ssr/page.js", "../../../assets/og-fonts/a.ttf"]);
    expect(await tracedBuildOnlyFiles(app)).toEqual([]);
  });

  it("skips the copies inside the standalone folder", async () => {
    const app = await appDir();
    await put(
      join(app, ".next", "standalone", "apps", "docs", ".next", "server", "page.js.nft.json"),
      JSON.stringify({ files: ["../../scripts/a.ts"] }),
    );
    expect(await tracedBuildOnlyFiles(app)).toEqual([]);
  });
});

describe("the standalone folder", () => {
  it("removes every env file outside node_modules and keeps the rest", async () => {
    const app = await appDir();
    const standalone = join(app, ".next", "standalone");
    await put(join(standalone, "apps", "docs", ".env"));
    await put(join(standalone, "apps", "docs", ".env.production"));
    await put(join(standalone, "apps", "docs", "server.js"));
    await put(join(standalone, "node_modules", "pkg", ".env"));
    expect(await removeStandaloneEnvFiles(app)).toEqual([
      "apps/docs/.env",
      "apps/docs/.env.production",
    ]);
    expect((await readdir(join(standalone, "apps", "docs"))).sort()).toEqual(["server.js"]);
    expect(await readdir(join(standalone, "node_modules", "pkg"))).toEqual([".env"]);
  });

  it("lists env and build-only files copied into it, relative to the folder", async () => {
    const app = await appDir();
    const standalone = join(app, ".next", "standalone");
    await put(join(standalone, "apps", "docs", ".env"));
    await put(join(standalone, "apps", "docs", "scripts", "playground", "limits.ts"));
    await put(join(standalone, "apps", "docs", "lib", "site.ts"));
    await put(join(standalone, "apps", "docs", "server.js"));
    await put(join(standalone, "package.json"));
    expect(await standaloneBuildOnlyFiles(app, "apps/docs")).toEqual([
      "apps/docs/.env",
      "apps/docs/scripts/playground/limits.ts",
    ]);
  });

  it("finds nothing when there is no build", async () => {
    const app = await appDir();
    expect(await standaloneBuildOnlyFiles(app, "apps/docs")).toEqual([]);
    expect(await removeStandaloneEnvFiles(app)).toEqual([]);
    expect(await tracedBuildOnlyFiles(app)).toEqual([]);
  });
});
