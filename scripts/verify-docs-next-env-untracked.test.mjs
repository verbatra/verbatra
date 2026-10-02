import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = resolve(REPO_ROOT, "apps/docs");

function git(...args) {
  return spawnSync("git", args, { cwd: DOCS_DIR, encoding: "utf8" });
}

describe("apps/docs treats next-env.d.ts as generated output", () => {
  it("does not track next-env.d.ts, since next dev and next build write different contents", () => {
    expect(git("ls-files", "--", "next-env.d.ts").stdout.trim()).toBe("");
  });

  it("ignores next-env.d.ts so a local dev run leaves the working tree clean", () => {
    expect(git("check-ignore", "-q", "next-env.d.ts").status).toBe(0);
  });

  it("generates next-env.d.ts with next typegen before the typecheck runs tsc", () => {
    const manifest = JSON.parse(readFileSync(resolve(DOCS_DIR, "package.json"), "utf8"));
    const steps = String(manifest.scripts.typecheck)
      .split("&&")
      .map((step) => step.trim());

    expect(steps.indexOf("next typegen")).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf("next typegen")).toBeLessThan(steps.indexOf("tsc --noEmit"));
  });
});
