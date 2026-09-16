import { describe, expect, it } from "vitest";
import { readMarkup } from "../scan/markup.js";
import { type PositionedScan, scanSource } from "../scan/tokenize.js";
import { directiveSuppression } from "./literal-directives.js";

function countingScan(source: string): { scan: PositionedScan; reads: () => number } {
  const scanned = scanSource(source, { markup: readMarkup });
  let reads = 0;
  const tokens = new Proxy(scanned.tokens, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) {
        reads += 1;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return { scan: { ...scanned, tokens }, reads: () => reads };
}

describe("directiveSuppression: cost", () => {
  it.each([
    [
      "a directive above every code line",
      '// verbatra-ignore-next-line\nconst a = "Hidden text";\n',
    ],
    [
      "a directive above every element",
      '(<div>{/* verbatra-ignore-next-line */}\n<p title="Hidden title" alt="Other">Text</p></div>);\n',
    ],
    ["a trailing directive on every line", 'const a = "Hidden text"; // verbatra-ignore-line\n'],
  ])("reads a bounded number of tokens per token with %s", (_label, unit) => {
    const { scan, reads } = countingScan(unit.repeat(2000));
    const isSuppressed = directiveSuppression(scan);

    scan.tokens.forEach((token, index) => {
      isSuppressed(token, index);
    });

    expect(scan.comments.length).toBeGreaterThanOrEqual(2000);
    expect(reads()).toBeLessThan(scan.tokens.length * 8);
  });
});
