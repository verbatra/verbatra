import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHECK_CLI_COMMAND,
  CHECK_EXIT_CODE,
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
const CLI_RUN = "packages/cli/src/run.ts";

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

  it("fails the pull request with the exit code check returns when a locale is out of sync", () => {
    expect(repoFile(CLI_RUN)).toContain(
      "return summary.inSync && !qaFails && !reviewFails && !sensitiveFails ? 0 : 1;",
    );
    expect(CHECK_EXIT_CODE).toBe(1);
  });
});
