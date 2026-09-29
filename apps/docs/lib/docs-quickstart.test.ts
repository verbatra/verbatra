import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const QUICKSTART = join(import.meta.dirname, "../content/docs/(get-started)/quickstart.mdx");
const WORD_CEILING = 800;

function proseWords(source: string): number {
  const body = source
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^```[\s\S]*?^```$/gm, "")
    .replace(/<[^>]+>/g, " ");
  return body.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
}

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
    const commands = [...source.matchAll(/^npx verbatra (\w+)/gm)].map((match) => match[1]);
    expect(commands).toEqual(["init", "translate", "translate", "check"]);
  });
});
