import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { proseWords } from "./page-type";

const GET_STARTED = join(import.meta.dirname, "../content/docs/(get-started)");
const QUICKSTART = join(GET_STARTED, "quickstart/index.mdx");
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];
const WORD_CEILING = 800;

describe("the quickstart", () => {
  const source = readFileSync(QUICKSTART, "utf8");

  it(`stays under ${WORD_CEILING} words of prose in English`, () => {
    expect(proseWords(source)).toBeLessThan(WORD_CEILING);
  });

  it("counts prose only, so a long code block does not hide a long page", () => {
    const padded = `${source}\n${"word ".repeat(WORD_CEILING)}\n`;
    expect(proseWords(padded)).toBeGreaterThan(WORD_CEILING);
    const fenced = `${source}\n\`\`\`text\n${"word ".repeat(WORD_CEILING)}\n\`\`\`\n`;
    expect(proseWords(fenced)).toBe(proseWords(source));
  });

  it("reaches a first translation through init, translate, and check", () => {
    const commands = [...source.matchAll(/^npx @verbatra\/cli (\w+)/gm)].map((match) => match[1]);
    expect(commands).toEqual(["init", "translate", "translate", "check"]);
  });

  it.each(LOCALE_SUFFIXES)(
    "nests the steps under their own H2 in quickstart/index%s.mdx",
    (suffix) => {
      const page = readFileSync(join(GET_STARTED, `quickstart/index${suffix}.mdx`), "utf8");
      const beforeSteps = page.slice(0, page.indexOf("<Steps>")).trimEnd().split("\n");
      expect(beforeSteps.at(-1)).toMatch(/^## \S/);
    },
  );
});
