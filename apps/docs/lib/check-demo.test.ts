import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHECK_CLI_COMMAND, CHECK_OVERALL_LINE, checkLocaleLine } from "@/lib/check-demo";

function repoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), "utf8");
}

const CLI_RENDER = "packages/cli/src/render.ts";

describe("the check demo quotes the cli", () => {
  it("prints the header, the locale line and the overall line the cli renders", () => {
    const render = repoFile(CLI_RENDER);
    expect(render).toContain(`"${CHECK_CLI_COMMAND}"`);
    expect(render).toContain(`"${CHECK_OVERALL_LINE}"`);
    expect(render).toMatch(/missing, \$\{l\.stale\} stale/);
    expect(render).toContain('l.inSync ? "in sync" : "out of sync"');
    expect(checkLocaleLine("de", 2, 12)).toBe(
      "  de: 2 missing, 0 stale, 12 up-to-date (out of sync)",
    );
  });
});

describe("the check demo stays out of the cli and the sdk at runtime", () => {
  it("imports nothing from the cli, the sdk or core", () => {
    const source = readFileSync(fileURLToPath(new URL("./check-demo.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/@verbatra\/(cli|core|sdk)|packages\/cli/);
  });

  it("is pinned to the real cli by the hero terminal run test", () => {
    const run = readFileSync(
      fileURLToPath(new URL("./hero-terminal.run.test.ts", import.meta.url)),
      "utf8",
    );
    expect(run).toContain('from "../../../packages/cli/src/render"');
    expect(run).toContain('from "../../../packages/cli/src/run"');
  });
});
