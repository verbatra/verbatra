import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHECK_IN_SYNC,
  CHECK_OUT_OF_SYNC,
  HERO_DEMO_COMMANDS,
  HERO_DEMO_OUTPUTS,
} from "@/lib/hero-demo";

function cliRender(): string {
  return readFileSync(
    fileURLToPath(new URL("../../../packages/cli/src/render.ts", import.meta.url)),
    "utf8",
  );
}

const CHECK_LINE =
  /^ {2}[a-z]{2}: (\d+) missing, (\d+) stale, (\d+) up-to-date \((in|out of) sync\)$/;
const TRANSLATE_LINE =
  /^ {2}([a-z]{2}|total): (?:(\d+) translated, (\d+) unchanged, )?(\d+) tokens \((\d+) in, (\d+) out\)$/;

describe("the hero demo quotes the cli", () => {
  it("prints the check summaries the cli renders", () => {
    const render = cliRender();
    expect(render).toContain(`"${CHECK_IN_SYNC}"`);
    expect(render).toContain(`"${CHECK_OUT_OF_SYNC}"`);
    expect(render).toMatch(/missing, \$\{l\.stale\} stale/);
    expect(render).toMatch(/up-to-date \(\$\{/);
    expect(render).toMatch(/succeeded, \$\{summary\.partial\.length\} partial/);
    expect(render).toMatch(/ {2}total: \$\{renderTokens\(summary\.usage\)\}/);
  });

  it("runs check, translate, then check again", () => {
    expect(HERO_DEMO_COMMANDS).toEqual(["verbatra check", "verbatra translate", "verbatra check"]);
    expect(HERO_DEMO_OUTPUTS[0]?.at(-1)).toBe(CHECK_OUT_OF_SYNC);
    expect(HERO_DEMO_OUTPUTS[2]?.at(-1)).toBe(CHECK_IN_SYNC);
  });

  it("keeps every check line in the cli's shape and its counts consistent", () => {
    for (const index of [0, 2]) {
      for (const line of (HERO_DEMO_OUTPUTS[index] ?? []).slice(0, -1)) {
        const match = CHECK_LINE.exec(line);
        expect(match, line).not.toBeNull();
        const [, missing, stale, upToDate, sync] = match as RegExpExecArray;
        expect(sync === "in").toBe(Number(missing) + Number(stale) === 0);
        expect(Number(missing) + Number(stale) + Number(upToDate)).toBe(8);
      }
    }
  });

  it("translates exactly what check reported and adds the tokens up", () => {
    const lines = HERO_DEMO_OUTPUTS[1] ?? [];
    const parsed = lines.slice(0, -1).map((line) => {
      const match = TRANSLATE_LINE.exec(line);
      expect(match, line).not.toBeNull();
      return match as RegExpExecArray;
    });
    const locales = parsed.filter((match) => match[1] !== "total");
    const total = parsed.find((match) => match[1] === "total");
    for (const match of locales) {
      expect(Number(match[2])).toBe(2);
      expect(Number(match[4])).toBe(Number(match[5]) + Number(match[6]));
    }
    const sum = (group: number) => locales.reduce((acc, match) => acc + Number(match[group]), 0);
    expect(Number(total?.[5])).toBe(sum(5));
    expect(Number(total?.[6])).toBe(sum(6));
    expect(lines.at(-1)).toBe(`${locales.length} succeeded, 0 partial, 0 failed`);
  });
});
