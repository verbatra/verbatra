import { expect, test } from "playwright/test";
import { homeUrl } from "./support";

const WIDTH = 320;
type LineBreakFinding = { text: string; at: number; reason: "in-word" | "closing-start" };

function lineBreakFindings({
  selector,
  language,
}: {
  selector: string;
  language: string;
}): LineBreakFinding[] {
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const closing = new Set([..."？！。、，．）」』】〕・ー…"]);
  const charTops = (root: Element): { text: string; tops: Array<number | undefined> } => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const tops: Array<number | undefined> = [];
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.textContent ?? "";
      for (let at = 0; at < value.length; at += 1) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        const box = range.getBoundingClientRect();
        tops.push(box.width > 0 ? box.top : undefined);
      }
      text += value;
    }
    return { text, tops };
  };
  const lineStarts = (tops: Array<number | undefined>): number[] => {
    const starts: number[] = [];
    let last: number | undefined;
    tops.forEach((top, at) => {
      if (top === undefined) return;
      if (last !== undefined && Math.abs(top - last) > 3) starts.push(at);
      last = top;
    });
    return starts;
  };
  return [...document.querySelectorAll(selector)].flatMap((element) => {
    const { text, tops } = charTops(element);
    const boundaries = new Set(Array.from(segmenter.segment(text), (part) => part.index));
    return lineStarts(tops).flatMap((at): LineBreakFinding[] => {
      const found: LineBreakFinding[] = [];
      if (!boundaries.has(at)) found.push({ text, at, reason: "in-word" });
      if (closing.has(text[at] ?? "")) found.push({ text, at, reason: "closing-start" });
      return found;
    });
  });
}

test.describe("Japanese line breaks at 320px", () => {
  test.use({ viewport: { width: WIDTH, height: 800 }, reducedMotion: "reduce" });

  for (const [name, selector] of [
    ["the statement band", "#statement .vk-statement-text"],
    ["every FAQ question", "#faq .vk-faq-question"],
  ] as const) {
    test(`never breaks inside a word or starts a line with a closing mark in ${name}`, async ({
      page,
    }) => {
      await page.goto(homeUrl("ja"));
      await expect(page.locator(selector).first()).toBeVisible();
      const findings = await page.evaluate(lineBreakFindings, { selector, language: "ja" });
      expect(findings).toEqual([]);
    });
  }
});
