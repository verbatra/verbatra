// @vitest-environment jsdom

import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCALES } from "./locales";
import { LOCK_DEMO_COUNTS } from "./lock-demo";
import { breakBetweenWords, splitWords } from "./word-segments";

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

describe("splitWords", () => {
  function host(text: string): Element {
    const doc = new DOMParser().parseFromString(markup(splitWords(text)), "text/html");
    return doc.body.firstElementChild as Element;
  }

  function words(text: string): Element[] {
    return [...host(text).querySelectorAll(".vk-word")];
  }

  it("wraps each word of a spaced heading in a span and keeps the spaces as real text", () => {
    expect(markup(splitWords("Two keys changed"))).toBe(
      '<span><span class="vk-word" style="--i:0">Two</span> <span class="vk-word" style="--i:1">keys</span> <span class="vk-word" style="--i:2">changed</span></span>',
    );
    expect(host("Two keys changed").textContent).toBe("Two keys changed");
  });

  it("gives every word its index as the only inline style", () => {
    const spans = words("One lock file. Every command reads it.");
    expect(spans.map((span) => span.getAttribute("style"))).toEqual(
      spans.map((_, index) => `--i:${index}`),
    );
    expect(spans.map((span) => span.textContent)).toEqual([
      "One",
      "lock",
      "file.",
      "Every",
      "command",
      "reads",
      "it.",
    ]);
  });

  it("adds no attribute, role or label beyond the class and the index", () => {
    for (const span of words("Gate pull requests")) {
      expect(span.getAttributeNames().sort()).toEqual(["class", "style"]);
    }
  });

  it("collapses runs of whitespace into one text node between spans", () => {
    expect(host("a  b").textContent).toBe("a  b");
    expect(words("a  b")).toHaveLength(2);
  });

  it.each([
    ["zh-CN", "两个键已更改，两个键已发送"],
    ["ja", "二つのキーが変更され、二つを送信"],
    ["zh-CN with Latin", "安装 Verbatra 之前"],
  ])("splits %s per segment with a break point between the spans", (_, text) => {
    const spans = words(text);
    expect(spans.length).toBeGreaterThan(1);
    expect(host(text).textContent).toBe(text);
    expect(host(text).querySelectorAll("wbr").length).toBe(spans.length - 1);
    for (const span of spans) {
      const han = [...(span.textContent ?? "")].filter((char) => /\p{Script=Han}/u.test(char));
      expect(han.length === 1 && (span.textContent ?? "").length === 1).toBe(false);
    }
  });

  it("numbers the spans of a spaceless heading from zero in order", () => {
    expect(words("两个键已更改，两个键已发送").map((span) => span.getAttribute("style"))).toEqual(
      words("两个键已更改，两个键已发送").map((_, index) => `--i:${index}`),
    );
  });

  it("keeps punctuation inside the word before it", () => {
    for (const span of words("两个键已更改，两个键已发送")) {
      expect(span.textContent).not.toMatch(/^[，。、]/);
    }
  });

  it("fades a spaceless heading as one block when the engine has no Intl.Segmenter", () => {
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    try {
      expect(words("无论问哪个入口，答案都一样")).toHaveLength(1);
      expect(host("无论问哪个入口，答案都一样").textContent).toBe("无论问哪个入口，答案都一样");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders an empty string as nothing", () => {
    expect(words("")).toHaveLength(0);
  });
});

describe("splitWords on every landing heading of every locale", () => {
  const KEYS = [
    ["gate", "heading"],
    ["features", "heading"],
    ["highlights", "heading"],
    ["comparison", "heading"],
    ["faq", "heading"],
    ["closing", "heading"],
    ["statement", "text"],
  ] as const;

  it.each([...LOCALES])(
    "keeps the %s text whole and never isolates one Han character",
    async (locale) => {
      const messages = (await import(`@/messages/${locale}.json`)).default.landing as Record<
        string,
        Record<string, string>
      >;
      for (const [section, key] of KEYS) {
        const text = messages[section]?.[key] ?? "";
        const doc = new DOMParser().parseFromString(
          renderToStaticMarkup(<h2>{splitWords(text)}</h2>),
          "text/html",
        );
        const heading = doc.querySelector("h2") as Element;
        expect(heading.textContent, `${locale} ${section}`).toBe(text);
        const spans = [...heading.querySelectorAll(".vk-word")];
        expect(spans.length, `${locale} ${section}`).toBeGreaterThan(0);
        for (const span of spans)
          expect(/^\p{Script=Han}$/u.test(span.textContent ?? ""), `${locale} ${section}`).toBe(
            false,
          );
      }
    },
  );
});

describe("splitWords on the lock demo heading of every locale", () => {
  const NO_BREAK_SPACE = "\u00a0";

  it.each([...LOCALES])(
    "keeps %s whole and never splits a no-break pair into two words",
    async (locale) => {
      const messages = (await import(`@/messages/${locale}.json`)).default;
      const text = createTranslator({ locale, messages, namespace: "landing.lockDemo" })(
        "heading",
        { count: LOCK_DEMO_COUNTS.changed },
      );
      const doc = new DOMParser().parseFromString(
        renderToStaticMarkup(<h2>{splitWords(text)}</h2>),
        "text/html",
      );
      const heading = doc.querySelector("h2") as Element;
      expect(heading.textContent, locale).toBe(text);
      const spans = [...heading.querySelectorAll(".vk-word")].map((span) => span.textContent ?? "");
      for (const span of spans) {
        expect(span.startsWith(NO_BREAK_SPACE), `${locale} ${span}`).toBe(false);
        expect(span.endsWith(NO_BREAK_SPACE), `${locale} ${span}`).toBe(false);
      }
      if (text.includes(NO_BREAK_SPACE))
        expect(
          spans.some((span) => span.includes(NO_BREAK_SPACE)),
          locale,
        ).toBe(true);
    },
  );

  it("keeps the German no-break pair inside one span", () => {
    const html = markup(splitWords("zwei\u00a0Schlüssel gesendet"));
    expect(html).toContain(">zwei\u00a0Schlüssel</span>");
  });
});
