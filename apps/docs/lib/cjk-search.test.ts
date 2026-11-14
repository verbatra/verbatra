import { initAdvancedSearch } from "fumadocs-core/search/server";
import { describe, expect, it } from "vitest";

interface Sentence {
  readonly locale: string;
  readonly title: string;
  readonly body: string;
  readonly midSentenceWord: string;
  readonly absentWord: string;
}

const SENTENCES: readonly Sentence[] = [
  {
    locale: "zh-CN",
    title: "快速入门",
    body: "我们使用自动翻译软件来处理本地化文件",
    midSentenceWord: "翻译",
    absentWord: "数据库",
  },
  {
    locale: "ja",
    title: "クイックスタート",
    body: "私は自動翻訳ツールを使ってロケールファイルを更新します",
    midSentenceWord: "翻訳",
    absentWord: "データベース",
  },
];

function buildServer() {
  return initAdvancedSearch({
    localeFilter: true,
    indexes: SENTENCES.map(({ locale, title, body }) => ({
      id: `page-${locale}`,
      url: `/${locale}/docs/start`,
      title,
      breadcrumbs: [],
      locale,
      structuredData: { headings: [], contents: [{ heading: undefined, content: body }] },
    })),
  });
}

describe("site search over Chinese and Japanese text", () => {
  const server = buildServer();

  it.each(SENTENCES)("finds a word from the middle of a $locale sentence", async (sentence) => {
    const results = await server.search(sentence.midSentenceWord, { locale: sentence.locale });
    expect(results.map((result) => result.url)).toContain(`/${sentence.locale}/docs/start`);
  });

  it.each(SENTENCES)("finds nothing for a $locale word the page lacks", async (sentence) => {
    expect(await server.search(sentence.absentWord, { locale: sentence.locale })).toEqual([]);
  });

  it("keeps each locale's results to its own pages", async () => {
    const results = await server.search("翻译", { locale: "zh-CN" });
    expect(results.every((result) => result.url.startsWith("/zh-CN/"))).toBe(true);
  });
});
