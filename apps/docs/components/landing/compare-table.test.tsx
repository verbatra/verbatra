import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COMPARE_ROWS, COMPARE_TOOLS, compareCell } from "@/lib/landing-compare";
import { arrowCut, CompareCellBody, type CompareTranslator, NoteWithArrow } from "./compare-table";

describe("arrowCut", () => {
  it("cuts before the last word of a plain note", () => {
    expect(arrowCut("one two")).toBe(4);
    expect(arrowCut("single")).toBe(0);
    expect(arrowCut("")).toBe(0);
  });

  it("cuts after the last hyphen or slash so the arrow stays with the final segment", () => {
    expect(arrowCut("a-b/c")).toBe(4);
  });

  it("cuts after a closing backtick when the last word opens inline code that ends inside it", () => {
    expect(arrowCut("`a b`c")).toBe(5);
  });

  it("keeps the word cut when the inline code runs to the end of the note", () => {
    expect(arrowCut("`a b`")).toBe(3);
  });

  it("keeps the word cut when the last word holds balanced backticks", () => {
    expect(arrowCut("use `a b` `c`.")).toBe(10);
  });

  it("cuts a spaceless clause at its last word instead of keeping the whole clause", () => {
    const note = "支持所有主流格式";
    expect(arrowCut(note, "zh-CN")).toBeGreaterThan(0);
    expect(arrowCut(note, "zh-CN")).toBeLessThan(note.length);
    expect(note.slice(arrowCut(note, "zh-CN"))).toBe("格式");
  });

  it("keeps closing punctuation with the last word of a spaceless clause", () => {
    const note = "完全支持，价格公开。";
    const tail = note.slice(arrowCut(note, "zh-CN"));
    expect(tail.endsWith("。")).toBe(true);
    expect(tail).not.toMatch(/^[。，、；：）」]/);
    expect(tail.length).toBeLessThan(note.length / 2);
  });

  it("keeps an opening bracket with the word it opens", () => {
    const note = "需要付费（企业版）";
    const tail = note.slice(arrowCut(note, "zh-CN"));
    expect(tail).toBe("（企业版）");
    expect(arrowCut("需要（翻译", "zh-CN")).toBe(2);
  });

  it("cuts a Latin word at the end of a spaceless note like the spaced rule", () => {
    expect(arrowCut("支持 Crowdin API", "zh-CN")).toBe(arrowCut("支持 Crowdin API", "en"));
    expect(arrowCut("兼容Crowdin导出", "zh-CN")).toBeGreaterThan(0);
    expect("兼容Crowdin导出".slice(arrowCut("兼容Crowdin导出", "zh-CN"))).toBe("导出");
    expect(arrowCut("a-b/c", "zh-CN")).toBe(4);
  });

  it("cuts after the closing backtick of inline code that ends a spaceless note", () => {
    expect(arrowCut("运行 `verbatra check` 即可", "zh-CN")).toBe("运行 `verbatra check` ".length);
    expect(arrowCut("先运行 `a b`。", "zh-CN")).toBe("先运行 `a b`".length);
    expect("使用`verbatra`命令即可。".slice(arrowCut("使用`verbatra`命令即可。", "zh-CN"))).toBe(
      "即可。",
    );
  });

  it("leaves the cut of a spaced locale on the whitespace rule", () => {
    expect(arrowCut("支持所有主流格式", "en")).toBe(0);
    expect(arrowCut("one two", "de")).toBe(4);
  });
});

describe("NoteWithArrow", () => {
  const render = (note: string, locale: string): string =>
    renderToStaticMarkup(<NoteWithArrow note={note} arrow={<i />} locale={locale} />);

  it("joins the arrow to a note that ends in inline code in a spaceless locale", () => {
    expect(render("`verbatra`", "zh-CN")).toContain("\u2060<i></i>");
  });

  it("leaves the markup of a spaced locale untouched", () => {
    expect(render("`verbatra`", "en")).not.toContain("\u2060");
    expect(render("one two", "de")).toBe('one <span class="vk-compare-unit">two<i></i></span>');
  });

  it("keeps a Chinese clause breakable except for its tail unit", () => {
    expect(render("支持所有主流格式", "zh-CN")).toBe(
      '支持<wbr/>所有<wbr/>主流<wbr/><span class="vk-compare-unit">格式<i></i></span>',
    );
  });
});

describe("the tail unit of a spaceless note", () => {
  it.each([
    ["通用编辑器", "编辑器"],
    ["未找到平台公开源码", "源码"],
    ["未说明是否网页版", "网页版"],
    ["官方框架适配器", "适配器"],
    ["见概览页", "页"],
  ])("never ends on a single Han character in %s", (note, word) => {
    const tail = note.slice(arrowCut(note, "zh-CN"));
    expect(tail.endsWith(word)).toBe(true);
    expect([...tail].length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the words of the note head whole and offers a break before the tail unit", () => {
    const markup = renderToStaticMarkup(
      <NoteWithArrow note="通用编辑器是否可用于字符串审校" arrow={<i />} locale="zh-CN" />,
    );
    expect(markup).not.toMatch(/编<wbr\/>辑|字<wbr\/>符|审<wbr\/>校/);
    expect(markup).toContain('<wbr/><span class="vk-compare-unit">');
  });

  it("wraps the whole word with the arrow", () => {
    const markup = renderToStaticMarkup(
      <NoteWithArrow note="按住 Alt 点击元素即可打开编辑器" arrow={<i />} locale="zh-CN" />,
    );
    expect(markup).toMatch(/<span class="vk-compare-unit">[^<]*编辑器<i><\/i><\/span>$/);
  });

  it("keeps closing punctuation with a word that would otherwise be one character", () => {
    const note = "支持源码。";
    const tail = note.slice(arrowCut(note, "zh-CN"));
    expect(tail.endsWith("源码。")).toBe(true);
    expect([...tail.replace("。", "")].length).toBeGreaterThanOrEqual(2);
  });
});

function lastUnitContent(markup: string): string {
  const open = markup.lastIndexOf('<span class="vk-compare-unit">');
  const start = open + '<span class="vk-compare-unit">'.length;
  let depth = 1;
  for (const tag of markup.slice(start).matchAll(/<(\/?)span\b/g)) {
    depth += tag[1] === "/" ? -1 : 1;
    if (depth === 0) return markup.slice(start, start + (tag.index ?? 0));
  }
  return markup.slice(start);
}

describe("CompareCellBody", () => {
  const messages = (locale: string) =>
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url)),
        "utf8",
      ),
    );
  const multiSource = COMPARE_ROWS.flatMap((row) =>
    COMPARE_TOOLS.map((tool) => ({ row, tool, links: compareCell(row, tool).urls.length })),
  ).filter((entry) => entry.links > 1);

  it.each(["en", "de", "es", "fr", "zh-CN"] as const)(
    "keeps every source arrow of a cell in the no-wrap unit with its last word in %s",
    (locale) => {
      const t = createTranslator({
        locale,
        messages: messages(locale),
        namespace: "landing.compare",
      }) as unknown as CompareTranslator;
      expect(multiSource.length).toBeGreaterThan(0);
      for (const { row, tool, links } of multiSource) {
        const markup = renderToStaticMarkup(
          <CompareCellBody t={t} row={row} tool={tool} locale={locale} />,
        );
        expect(lastUnitContent(markup).split('data-source=""').length - 1).toBe(links);
      }
    },
  );
});
