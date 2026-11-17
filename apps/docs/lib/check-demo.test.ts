import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHECK_CLI_COMMAND,
  CHECK_OVERALL_LINE,
  checkBadge,
  checkLocaleLine,
} from "@/lib/check-demo";
import {
  HERO_CHECK_BADGE,
  HERO_TERMINAL_CHANGED_KEYS,
  HERO_TERMINAL_SYNCED_KEYS,
} from "@/lib/hero-terminal";
import { RAIL_BADGE, SURFACE_COUNTS } from "@/lib/highlights-surfaces";

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
      "  de: 0 missing, 2 stale, 12 up-to-date (out of sync)",
    );
  });
});

describe("the check badge", () => {
  it("is the one wording of the stale and up-to-date counts, shared by the locale line, the hero and the rail", () => {
    expect(checkBadge(2, 12)).toBe("2 stale, 12 up-to-date");
    expect(checkLocaleLine("de", 2, 12)).toContain(checkBadge(2, 12));
    expect(HERO_CHECK_BADGE).toBe(
      checkBadge(HERO_TERMINAL_CHANGED_KEYS.length, HERO_TERMINAL_SYNCED_KEYS.length),
    );
    expect(RAIL_BADGE).toBe(checkBadge(SURFACE_COUNTS.stale, SURFACE_COUNTS.upToDate));
  });
});

describe("the check demo stays out of the cli and the sdk at runtime", () => {
  it("imports nothing from the cli, the sdk or core", () => {
    const source = readFileSync(fileURLToPath(new URL("./check-demo.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/@verbatra\/(cli|core|sdk)|packages\/cli/);
  });
});
