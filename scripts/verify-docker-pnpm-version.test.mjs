import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DOCKERFILE = readFileSync(resolve(REPO_ROOT, "apps/docs/Dockerfile"), "utf8");
const ROOT_MANIFEST = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));

const PNPM_INSTALLS = [...DOCKERFILE.matchAll(/^RUN npm install --global pnpm@(\S+)\s*$/gm)];

describe("docs Dockerfile pnpm version", () => {
  it("installs pnpm exactly once", () => {
    expect(PNPM_INSTALLS).toHaveLength(1);
  });

  it("installs the version package.json pins in packageManager", () => {
    expect(ROOT_MANIFEST.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(PNPM_INSTALLS[0]?.[1]).toBe(ROOT_MANIFEST.packageManager.replace(/^pnpm@/, ""));
  });
});
