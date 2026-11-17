import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DOCKERFILE = readFileSync(resolve(REPO_ROOT, "apps/docs/Dockerfile"), "utf8");
const ROOT_MANIFEST = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));

const COREPACK_ENABLES = [...DOCKERFILE.matchAll(/^RUN corepack enable && corepack install\s*$/gm)];
const MANIFEST_COPY_INDEX = DOCKERFILE.search(/^COPY package\.json \.\/\s*$/m);

describe("docs Dockerfile pnpm version", () => {
  it("activates pnpm through corepack exactly once", () => {
    expect(COREPACK_ENABLES).toHaveLength(1);
    expect(DOCKERFILE).not.toMatch(/npm install --global pnpm/);
  });

  it("installs the pinned pnpm in the same step instead of at the first pnpm call", () => {
    expect(DOCKERFILE).toMatch(/^RUN corepack enable && corepack install\s*$/m);
    expect(DOCKERFILE).not.toMatch(/^RUN corepack enable\s*$/m);
  });

  it("copies the manifest before corepack reads the packageManager field", () => {
    expect(MANIFEST_COPY_INDEX).toBeGreaterThan(-1);
    expect(MANIFEST_COPY_INDEX).toBeLessThan(COREPACK_ENABLES[0]?.index ?? -1);
  });

  it("pins packageManager to a version with a sha512 hash", () => {
    expect(ROOT_MANIFEST.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+\+sha512\.[0-9a-f]{128}$/);
  });
});
