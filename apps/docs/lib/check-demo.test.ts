import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHECK_CLI_COMMAND,
  CHECK_LOCALE_LINE,
  CHECK_MISSING_KEYS,
  CHECK_OVERALL_LINE,
  CHECK_RUN_LINES,
  CHECK_UP_TO_DATE,
} from "@/lib/check-demo";
import { GATE_REFUSAL, GATE_SOURCE_VALUES } from "@/lib/gate-demo";

function repoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), "utf8");
}

const CLI_RENDER = "packages/cli/src/render.ts";

describe("the check demo quotes the cli", () => {
  it("counts the key the translate run withheld as the one still missing", () => {
    expect(CHECK_MISSING_KEYS).toEqual([GATE_REFUSAL.key]);
    expect(CHECK_UP_TO_DATE + CHECK_MISSING_KEYS.length).toBe(
      Object.keys(GATE_SOURCE_VALUES).length,
    );
  });

  it("prints the header, the locale line and the overall line the cli renders", () => {
    const render = repoFile(CLI_RENDER);
    expect(render).toContain(`"${CHECK_CLI_COMMAND}"`);
    expect(render).toContain(`"${CHECK_OVERALL_LINE}"`);
    expect(render).toMatch(/missing, \$\{l\.stale\} stale/);
    expect(render).toContain('l.inSync ? "in sync" : "out of sync"');
    expect(CHECK_RUN_LINES).toEqual([CHECK_CLI_COMMAND, CHECK_LOCALE_LINE, CHECK_OVERALL_LINE]);
  });
});

describe("the check demo stays out of the cli and the sdk at runtime", () => {
  it("imports nothing from the cli, the sdk or core", () => {
    const source = readFileSync(fileURLToPath(new URL("./check-demo.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/@verbatra\/(cli|core|sdk)|packages\/cli/);
  });

  it("is pinned to the real cli only from the run test", () => {
    const run = readFileSync(
      fileURLToPath(new URL("./check-demo.run.test.ts", import.meta.url)),
      "utf8",
    );
    expect(run).toContain('from "../../../packages/cli/src/render"');
    expect(run).toContain('from "../../../packages/cli/src/run"');
  });
});
