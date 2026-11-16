import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import { isSpaceless } from "./word-count";

type Notice = { joined: string; joinedOutdated: string };

function notice(locale: string): Notice {
  const path = join(process.cwd(), "messages", `${locale}.json`);
  const catalog = JSON.parse(readFileSync(path, "utf8")) as {
    docs: { machineTranslated: Notice };
  };
  return catalog.docs.machineTranslated;
}

const SENTENCE_END: Readonly<Record<string, string>> = { "zh-CN": "。", ja: "。" };

describe("the machine-translated notice", () => {
  it.each(i18n.languages)("%s takes its sentence punctuation from the message", (locale) => {
    const { joined, joinedOutdated } = notice(locale);
    const end = SENTENCE_END[locale] ?? ".";
    expect(joined.endsWith(`</link>${end}`)).toBe(true);
    expect(joinedOutdated.endsWith(`</link>${end}`)).toBe(true);
    expect(joined).toContain("{machine}");
    expect(joinedOutdated).toContain("{outdated}");
  });

  it("names the sentence end of every spaceless locale, so none falls back to a period", () => {
    for (const locale of i18n.languages.filter(isSpaceless)) {
      expect(SENTENCE_END[locale], locale).toBe("。");
    }
  });

  it("joins a Chinese notice without a space around the link", () => {
    expect(notice("zh-CN").joined).toBe("{machine}<link>{original}</link>。");
  });

  it("joins a Japanese notice without a space around the link", () => {
    expect(notice("ja").joined).toBe("{machine}<link>{original}</link>。");
    expect(notice("ja").joinedOutdated).toBe("{machine}{outdated}<link>{original}</link>。");
  });

  it.each(["en", "de", "es", "fr", "pt-BR"])("keeps the spaced form in %s", (locale) => {
    expect(notice(locale).joined).toBe("{machine} <link>{original}</link>.");
    expect(notice(locale).joinedOutdated).toBe("{machine} {outdated} <link>{original}</link>.");
  });
});
