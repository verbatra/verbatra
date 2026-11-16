import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { breakBetweenWords } from "./word-segments";

function markup(text: ReactNode): string {
  return renderToStaticMarkup(<span>{text}</span>);
}

describe("breakBetweenWords", () => {
  const pieces = (text: string): string[] =>
    markup(breakBetweenWords(text))
      .replace(/^<span>|<\/span>$/g, "")
      .split("<wbr/>");

  it("offers a break only between the words of a Chinese heading", () => {
    expect(pieces("无论问哪个入口，答案都一样").join("")).toBe("无论问哪个入口，答案都一样");
    expect(pieces("无论问哪个入口，答案都一样").length).toBeGreaterThan(1);
  });

  it.each(["字符串", "适配器", "编辑器", "源码", "网页版", "密钥"])(
    "never breaks inside the word %s",
    (word) => {
      expect(markup(breakBetweenWords(word))).toBe(`<span>${word}</span>`);
    },
  );

  it("never breaks inside a word of the headings that used to split", () => {
    expect(
      pieces("让每个语言环境保持同步。").every((piece) => !/^\p{Script=Han}$/u.test(piece)),
    ).toBe(true);
    expect(pieces("让每个语言环境保持同步。")[0]).toMatch(/^让每个/);
    expect(markup(breakBetweenWords("字符串或 API 密钥发到别处吗？"))).not.toMatch(
      /密<wbr\/>钥|字符<wbr\/>串/,
    );
    expect(pieces("编写自定义格式适配器")[pieces("编写自定义格式适配器").length - 1]).toMatch(
      /适配器$/,
    );
  });

  it("never leaves a single Han character between two break points", () => {
    for (const text of [
      "让每个语言环境保持同步。",
      "我们很好地处理了这个问题",
      "把语言环境代码加入配置",
      "无论问哪个入口，答案都一样",
      "覆盖整个翻译工作流程",
      "检查所有语言环境是否同步",
      "字符串或 API 密钥发到别处吗？",
      "支持 Crowdin 导出和 2 个文件",
    ])
      for (const piece of pieces(text)) {
        const han = [...piece].filter((char) => /\p{Script=Han}/u.test(char));
        if (piece.trim() !== "" && han.length > 0 && han.length === [...piece].length)
          expect(han.length).toBeGreaterThanOrEqual(2);
      }
  });

  it("keeps a string of one-character segments, a leading one and closing punctuation intact", () => {
    expect(markup(breakBetweenWords("让每个"))).toBe("<span>让每个</span>");
    expect(pieces("把语言环境代码加入")[0]?.length).toBeGreaterThanOrEqual(2);
    expect(markup(breakBetweenWords("编辑器。"))).toBe("<span>编辑器。</span>");
    expect(markup(breakBetweenWords("共 2 个文件，共2个文件"))).not.toMatch(/2<wbr\/>个/);
    expect(markup(breakBetweenWords("支持 Crowdin、DeepL 和 API 密钥"))).not.toMatch(/密<wbr\/>钥/);
  });

  it("segments Japanese text with the Japanese dictionary", () => {
    expect(markup(breakBetweenWords("日本語の見出し"))).toContain("<wbr/>");
  });

  it("walks arrays and leaves elements and spaced scripts untouched", () => {
    expect(markup(breakBetweenWords(["Gate pull requests", 7]))).toBe(
      "<span>Gate pull requests7</span>",
    );
    expect(breakBetweenWords("Gate pull requests")).toBe("Gate pull requests");
  });
});

describe("breakBetweenWords without Intl.Segmenter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["无论问哪个入口，答案都一样", "ファイルを同期します"])(
    "returns %s unchanged and unbroken",
    (text) => {
      vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
      expect(markup(breakBetweenWords(text))).toBe(`<span>${text}</span>`);
    },
  );

  it("leaves Latin text unchanged", () => {
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    expect(markup(breakBetweenWords("Plain Latin text"))).toBe("<span>Plain Latin text</span>");
  });
});
