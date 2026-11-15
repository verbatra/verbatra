import { describe, expect, it } from "vitest";
import {
  countWords,
  groupWordSegments,
  lastWordStart,
  SPACELESS_SCRIPT,
  type WordSegment,
} from "@/lib/word-count";

describe("countWords", () => {
  it.each(["en", "de", "es", "fr"])("counts whitespace separated words in %s", (locale) => {
    expect(countWords("  one two\tthree\nfour  ", locale)).toBe(4);
    expect(countWords("", locale)).toBe(0);
    expect(countWords("   ", locale)).toBe(0);
    expect(countWords("hash-based lock file.", locale)).toBe(3);
  });

  it("counts a spaced language by whitespace even when the text holds CJK", () => {
    expect(countWords("北京 上海", "en")).toBe(2);
  });

  it("segments Simplified Chinese, which has no spaces, into words", () => {
    expect(countWords("我们喜欢翻译软件", "zh-CN")).toBeGreaterThan(1);
    expect(countWords("我们喜欢翻译软件", "zh-CN")).toBeLessThan(8);
  });

  it("segments Japanese, which has no spaces, into words", () => {
    expect(countWords("私は翻訳ツールが好きです", "ja")).toBeGreaterThan(1);
  });

  it("ignores punctuation and whitespace segments in a spaceless language", () => {
    expect(countWords("。、 ！", "zh-CN")).toBe(0);
    expect(countWords("", "ja")).toBe(0);
  });

  it("counts Latin words inside a spaceless locale once each", () => {
    expect(countWords("verbatra translate", "zh-CN")).toBe(2);
  });
});

describe("lastWordStart", () => {
  it("returns where the last word-like segment of a spaceless text starts", () => {
    expect(lastWordStart("我们喜欢翻译，软件。", "zh-CN")).toBeGreaterThan(5);
    expect(lastWordStart("", "zh-CN")).toBe(0);
    expect(lastWordStart("。，", "zh-CN")).toBe(0);
    expect(lastWordStart("支持 Crowdin", "zh-CN")).toBe(3);
  });
});

describe("lastWordStart keeps a tail of at least two Han characters", () => {
  it.each([
    ["通用编辑器", "编辑器"],
    ["公开源码", "源码"],
    ["未说明是否网页版", "网页版"],
    ["官方框架适配器", "适配器"],
    ["我们喜欢字符串", "字符串"],
  ])("cuts %s so its tail ends with %s and is not one character", (text, word) => {
    const tail = text.slice(lastWordStart(text, "zh-CN"));
    expect(tail.endsWith(word)).toBe(true);
    expect([...tail].length).toBeGreaterThanOrEqual(2);
  });
});

const wordLike = (segment: string): WordSegment => ({ segment, isWordLike: true });
const other = (segment: string): WordSegment => ({ segment, isWordLike: false });
const texts = (segments: WordSegment[]): string[] =>
  groupWordSegments(segments).map((group) => group.text);

describe("groupWordSegments", () => {
  it("merges a run of one-character segments into one group", () => {
    expect(texts(["让", "每", "个", "语言", "环境"].map(wordLike))).toEqual([
      "让每个",
      "语言",
      "环境",
    ]);
    expect(texts(["我", "们", "很", "好"].map(wordLike))).toEqual(["我们很好"]);
  });

  it("joins a trailing one-character segment to the segment before it", () => {
    expect(texts(["适", "配", "器"].map(wordLike))).toEqual(["适配器"]);
    expect(texts(["编辑", "器"].map(wordLike))).toEqual(["编辑器"]);
    expect(texts(["字符", "串"].map(wordLike))).toEqual(["字符串"]);
    expect(texts([wordLike("编辑"), wordLike("器"), other("。")])).toEqual(["编辑器", "。"]);
  });

  it("joins a leading one-character segment to the segment after it", () => {
    expect(texts(["把", "语言环境", "代码"].map(wordLike))).toEqual(["把语言环境", "代码"]);
    expect(texts([other("，"), wordLike("个"), wordLike("语言")])).toEqual(["，", "个语言"]);
  });

  it("leaves a group of two or more characters alone", () => {
    expect(texts(["无论", "问", "哪个", "入口"].map(wordLike))).toEqual(["无论问", "哪个", "入口"]);
    expect(texts(["入口", "答案"].map(wordLike))).toEqual(["入口", "答案"]);
  });

  it("joins a one-character segment to Latin text and digits before it", () => {
    expect(texts([wordLike("API"), other(" "), wordLike("密"), wordLike("钥")])).toEqual([
      "API",
      " ",
      "密钥",
    ]);
    expect(texts([wordLike("2"), wordLike("个"), wordLike("文件")])).toEqual(["2个", "文件"]);
    expect(texts([wordLike("兼容"), wordLike("Crowdin"), wordLike("导"), wordLike("出")])).toEqual([
      "兼容",
      "Crowdin导出",
    ]);
    expect(texts([wordLike("Crowdin"), wordLike("器")])).toEqual(["Crowdin器"]);
  });

  it("keeps a one-character segment alone only when no word-like neighbour exists", () => {
    expect(texts([wordLike("器")])).toEqual(["器"]);
    expect(texts([other("（"), wordLike("器"), other("）")])).toEqual(["（", "器", "）"]);
  });

  it("gives a run of more than three one-character segments after a word its first character and keeps the rest together", () => {
    expect(texts(["平台", "未", "称", "开", "源"].map(wordLike))).toEqual(["平台未", "称开源"]);
    expect(texts(["字符", "串", "或", "API"].map(wordLike))).toEqual(["字符串或", "API"]);
    expect(texts(["提供", "商", "出", "错", "时"].map(wordLike))).toEqual(["提供商", "出错时"]);
  });

  it("records where every group starts in the original text", () => {
    const groups = groupWordSegments(["让", "每", "个", "，", "语言"].map((s) => wordLike(s)));
    expect(groups.map((group) => group.index)).toEqual([0, 3, 4]);
  });

  it("holds its invariant for every segment list up to six pieces, whatever the segmenter returns", () => {
    const alphabet: WordSegment[] = [
      wordLike("字"),
      wordLike("编辑"),
      wordLike("Crowdin"),
      wordLike("7"),
      other("，"),
      other(" "),
    ];
    const lists: WordSegment[][] = [[]];
    for (let length = 1; length <= 6; length += 1)
      for (const list of lists.filter((entry) => entry.length === length - 1))
        for (const piece of alphabet) lists.push([...list, piece]);
    for (const list of lists) {
      const groups = groupWordSegments(list);
      expect(groups.map((group) => group.text).join("")).toBe(list.map((s) => s.segment).join(""));
      let offset = 0;
      groups.forEach((group, position) => {
        expect(group.index).toBe(offset);
        offset += group.text.length;
        const lone =
          group.isWordLike && [...group.text].length === 1 && SPACELESS_SCRIPT.test(group.text);
        if (!lone) return;
        expect(groups[position - 1]?.isWordLike ?? false).toBe(false);
        expect(groups[position + 1]?.isWordLike ?? false).toBe(false);
      });
    }
  });
});
