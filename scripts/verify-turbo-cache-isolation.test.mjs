import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECKOUT_LOCAL_OUTPUTS = ["!.next/cache/**", "!.next/dev/**"];

function readTurboConfig(relativePath) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), "utf8"));
}

describe("turbo keeps cached task outputs inside the checkout that produced them", () => {
  it("pins an explicit cacheDir so linked git worktrees do not share the main worktree's cache", () => {
    expect(readTurboConfig("turbo.json").cacheDir).toBe(".turbo/cache");
  });

  it.each(CHECKOUT_LOCAL_OUTPUTS)(
    "excludes %s from the docs build outputs, since Next.js writes absolute checkout paths there",
    (exclusion) => {
      const outputs = readTurboConfig("apps/docs/turbo.json").tasks.build.outputs;

      expect(outputs).toContain(".next/**");
      expect(outputs).toContain(exclusion);
    },
  );
});
