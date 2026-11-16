import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  countWords,
  groupWordSegments,
  lastWordStart,
  SPACELESS_SCRIPT,
  type WordSegment,
} from "@/lib/word-count";

describe("countWords", () => {
  it.each(["en", "de", "es", "fr", "pt-BR"])(
    "counts whitespace separated words in %s",
    (locale) => {
      expect(countWords("  one two\tthree\nfour  ", locale)).toBe(4);
      expect(countWords("", locale)).toBe(0);
      expect(countWords("   ", locale)).toBe(0);
      expect(countWords("hash-based lock file.", locale)).toBe(3);
    },
  );

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

describe("SPACELESS_SCRIPT", () => {
  it.each(["漢", "ひ", "カ", "ー", "・"])("matches the Japanese character %s", (character) => {
    expect(SPACELESS_SCRIPT.test(character)).toBe(true);
  });

  it.each(["a", "7", "-", "_", " ", "。"])("does not match %s", (character) => {
    expect(SPACELESS_SCRIPT.test(character)).toBe(false);
  });

  it("counts a lone long-vowel mark as a lone Japanese character, so it joins its neighbour", () => {
    const groups = groupWordSegments([
      { segment: "プロバイダ", isWordLike: true },
      { segment: "ー", isWordLike: true },
    ]);
    expect(groups.map((group) => group.text)).toEqual(["プロバイダー"]);
  });

  it("leaves Latin and Chinese lone-character handling as it was", () => {
    expect(
      groupWordSegments([
        { segment: "支持", isWordLike: true },
        { segment: "a", isWordLike: true },
      ]).map((group) => group.text),
    ).toEqual(["支持", "a"]);
    expect(
      groupWordSegments([
        { segment: "编辑", isWordLike: true },
        { segment: "器", isWordLike: true },
      ]).map((group) => group.text),
    ).toEqual(["编辑器"]);
  });
});

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

const ENDING_START = /^(?:ます|ません|ました|した|さい|せん|たい|れる)/u;
const KATAKANA_ENDING_START = /^(?:ター|ション)/u;

describe("groupWordSegments with kana pieces", () => {
  it("keeps text and offsets for every list up to six kana pieces and never opens a group on an ending after a word", () => {
    const alphabet: WordSegment[] = [
      wordLike("の"),
      wordLike("ます"),
      wordLike("書き"),
      wordLike("込"),
      wordLike("コン"),
      wordLike("ション"),
      other("、"),
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
        expect(group.text).not.toBe("");
        offset += group.text.length;
        if (position > 0 && groups[position - 1]?.isWordLike === true && group.isWordLike)
          expect(group.text).not.toMatch(ENDING_START);
      });
    }
  });
});

describe("groupWordSegments groups Japanese text", () => {
  const japanese = new Intl.Segmenter("ja", { granularity: "word" });
  const shown = (text: string): string =>
    groupWordSegments(japanese.segment(text))
      .filter((group) => group.isWordLike)
      .map((group) => group.text)
      .join("¦");

  it.each([
    ["まずドライランから", "まず¦ドライランから"],
    [
      "Verbatra はどの翻訳プロバイダーに対応していますか？",
      "Verbatra¦はどの¦翻訳¦プロバイダーに¦対応していますか",
    ],
    ["Apache-2.0（リポジトリ）", "Apache¦2.0¦リポジトリ"],
    ["コマンドラインツール（CLI）", "コマンドライン¦ツール¦CLI"],
    ["ファイルフォーマット", "ファイル¦フォーマット"],
    ["プライバシーポリシー", "プライバシー¦ポリシー"],
    ["プライベートクラウドは非対応", "プライベート¦クラウドは¦非対応"],
    ["サーバーサイドレンダリング", "サーバーサイド¦レンダリング"],
  ])("splits %s as %s", (text, expected) => {
    expect(shown(text)).toBe(expected);
  });

  it("does not chain separate katakana words past eight characters", () => {
    expect(shown("サーバーサイドレンダリングコントリビューションガイド")).toBe(
      "サーバーサイド¦レンダリング¦コントリビューション¦ガイド",
    );
  });

  it("does not treat a long vowel mark alone as katakana", () => {
    const pieces = [
      { segment: "ーー", isWordLike: true },
      { segment: "ーー", isWordLike: true },
    ];
    expect(groupWordSegments(pieces, { keepEndings: false })).toHaveLength(2);
  });

  it("attaches a lone kanji forward to the okurigana or kanji that follows", () => {
    expect(shown("プロバイダーが誤っても、何も書き込まれません")).toContain("誤っても");
    expect(shown("プライベートクラウドは非対応")).toContain("非対応");
  });

  it("keeps a lone kanji suffix with the word before it", () => {
    expect(shown("翻訳者が確認します")).toBe("翻訳者が¦確認します");
    expect(shown("翻訳者向けの")).toBe("翻訳者¦向けの");
    expect(shown("ホスト型なし")).toBe("ホスト型なし");
    expect(shown("単語数課金")).toBe("単語数¦課金");
    expect(shown("ライセンス欄なし")).toBe("ライセンス欄なし");
    expect(shown("書き込まれません")).toBe("書き込まれません");
    expect(shown("運営者情報")).toBe("運営者¦情報");
  });

  it("sends a lone prefix kanji forward to the word it opens", () => {
    expect(shown("Verbatra と他ツールの比較")).toBe("Verbatra¦と¦他ツールの¦比較");
    expect(shown("高度機能は要ライセンス")).toBe("高度¦機能は¦要ライセンス");
    expect(shown("管理者が各サービスの認証情報")).toBe("管理者が¦各サービスの¦認証¦情報");
    expect(shown("機能は非対応")).toBe("機能は¦非対応");
  });

  it("caps every group at eight characters unless it keeps one word whole", () => {
    expect(shown("メールアドレスとは別の電子的な連絡手段")).toBe(
      "メールアドレス¦とは別の¦電子的な¦連絡¦手段",
    );
    expect(shown("フォーマットの数は各ベンダー")).toBe("フォーマットの数¦は¦各ベンダー");
    expect(shown("現行の CLI とプラットフォーム")).toBe("現行の¦CLI¦と¦プラットフォーム");
  });

  it("breaks before the stem of a word, never inside it", () => {
    expect(shown("翻訳が欠けているとき、Verbatra は pull request を失敗させられますか？")).toBe(
      "翻訳が¦欠けているとき¦Verbatra¦は¦pull¦request¦を¦失敗させられますか",
    );
    expect(shown("プロンプトを選択し、手でコピーしてください")).toBe(
      "プロンプトを¦選択し¦手で¦コピーして¦ください",
    );
    expect(shown("コピーしました")).toBe("コピーしました");
    expect(shown("一致しなくなりました")).toBe("一致しなく¦なりました");
    expect(shown("意味ではありません")).toBe("意味では¦ありません");
    expect(shown("送信できませんでした")).toBe("送信¦できませんでした");
    expect(shown("以上にしてください")).toBe("以上にして¦ください");
    expect(shown("をインストールしたら")).toBe("を¦インストールしたら");
  });

  it("keeps a katakana word whole when its last piece would pass eight characters", () => {
    expect(shown("コントリビューター")).toBe("コントリビューター");
    expect(shown("コントリビューションガイド")).toBe("コントリビューション¦ガイド");
  });

  it("keeps an ending whole while the group stays within eight characters", () => {
    expect(shown("対応していますか")).toBe("対応していますか");
  });

  it("leaves Simplified Chinese grouping alone", () => {
    const chinese = new Intl.Segmenter("zh", { granularity: "word" });
    const groups = (text: string): string[] =>
      groupWordSegments(chinese.segment(text)).map((group) => group.text);
    expect(groups("字符串或 API 密钥发到别处吗？")).toEqual([
      "字符串或",
      " ",
      "API",
      " ",
      "密钥发到",
      "别处吗",
      "？",
    ]);
  });
});

describe("lastWordStart keeps a Japanese tail short", () => {
  it("cuts only the last ending, never the whole verb phrase", () => {
    const note = "本体は記載なし";
    expect(note.slice(lastWordStart(note, "ja"))).toBe("なし");
  });

  it("keeps a katakana word whole at the end", () => {
    const note = "ホスト型、リポジトリ";
    expect(note.slice(lastWordStart(note, "ja"))).toBe("リポジトリ");
  });
});

describe("lastWordStart keeps a particle with the word before it", () => {
  it.each([
    ["ローカルのみ", "ローカルのみ"],
    ["製品なし、選ぶサービスによる", "による"],
    ["企業向けレビューキューのみ", "のみ"],
    ["Baidu（セルフホストのみ）", "のみ）"],
    ["旧 CLI はローカルの Ollama で動作", "で動作"],
  ])("cuts %s so its tail is %s", (note, tail) => {
    expect(note.slice(lastWordStart(note, "ja"))).toBe(tail);
  });
});

describe("Japanese grouping over every message", () => {
  const japanese = new Intl.Segmenter("ja", { granularity: "word" });
  const flatten = (node: unknown): string[] =>
    typeof node === "string"
      ? [node]
      : Object.values(node as Record<string, unknown>).flatMap(flatten);
  const values = flatten(
    JSON.parse(readFileSync(new URL("../messages/ja.json", import.meta.url), "utf8")),
  ).filter((value) => SPACELESS_SCRIPT.test(value));
  const characters = (text: string): number => [...text].length;
  const KEPT_WHOLE = new Set([
    "ページナビゲーション",
    "アップグレードして",
    "インストールしたら",
    "コントリビューション",
    "コントリビューター",
    "インポートした値は",
    "同期していない間は",
    "オプトアウトしています",
    "修正したりしています",
    "失敗させられますか",
  ]);

  it("rebuilds every value from its groups", () => {
    for (const value of values)
      expect(
        groupWordSegments(japanese.segment(value))
          .map((group) => group.text)
          .join(""),
      ).toBe(value);
  });

  it("exceeds eight characters only for one ICU token or a word kept whole", () => {
    for (const value of values) {
      const tokens = new Set([...japanese.segment(value)].map((part) => part.segment));
      for (const group of groupWordSegments(japanese.segment(value)))
        if (group.isWordLike && characters(group.text) > 8)
          expect(tokens.has(group.text) || KEPT_WHOLE.has(group.text)).toBe(true);
    }
  });

  it("never opens a group on a small kana, a long vowel mark or an ending", () => {
    for (const value of values) {
      const groups = groupWordSegments(japanese.segment(value));
      groups.forEach((group, position) => {
        if (!group.isWordLike || groups[position - 1]?.isWordLike !== true) return;
        expect(group.text).not.toMatch(/^[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー]/u);
        expect(group.text).not.toMatch(ENDING_START);
        expect(group.text).not.toMatch(KATAKANA_ENDING_START);
      });
    }
  });

  it("leaves a lone particle only after a Latin word or a full eight-character group", () => {
    for (const value of values) {
      const groups = groupWordSegments(japanese.segment(value));
      groups.forEach((group, position) => {
        const previous = groups[position - 1];
        if (!group.isWordLike || previous?.isWordLike !== true) return;
        if (!/^[はがをにでとのもへやかねよ]$/u.test(group.text)) return;
        expect(!SPACELESS_SCRIPT.test(previous.text) || characters(previous.text) === 8).toBe(true);
      });
    }
  });
});
