import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readIncludedSource } from "../apps/docs/lib/docs-pages.ts";
import { assertLocaleTable, LOCALES, localeAlternation, localeOfFile } from "./docs-locales.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = resolve(REPO_ROOT, "apps/docs/content/docs");
const MESSAGES_DIR = resolve(REPO_ROOT, "apps/docs/messages");

const SPELLED_COUNTS = assertLocaleTable(
  {
    en: {
      numbers:
        "five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty",
      nouns: "formats|providers|commands|subcommands",
    },
    de: {
      numbers:
        "fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig",
      nouns: "formaten?|providern?|anbietern?|befehlen?|unterbefehlen?|kommandos",
    },
    es: {
      numbers:
        "cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciséis|diecisiete|dieciocho|diecinueve|veinte",
      nouns: "formatos|proveedores|comandos|subcomandos",
    },
    fr: {
      numbers:
        "cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt",
      nouns: "formats|fournisseurs|commandes|sous-commandes",
    },
    "zh-CN": {
      numbers: "二十|十九|十八|十七|十六|十五|十四|十三|十二|十一|十|九|八|七|六|五",
      counters: "种|个|款|项|类|条|家",
      nouns: "文件格式|格式|提供商|子命令|命令",
    },
    "pt-BR": {
      numbers:
        "cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte",
      nouns: "formatos|provedores|comandos|subcomandos",
    },
    ja: {
      numbers: "二十|十九|十八|十七|十六|十五|十四|十三|十二|十一|十|九|八|七|六|五",
      wago: "いつつ|むっつ|ななつ|やっつ|ここのつ|とお",
      counters: "種類|種|つ|個|件|社|本|項目",
      filler:
        "(?:の\\s*)?(?:[A-Za-z]+\\s*|組み込みの?\\s*|[\\p{Script=Han}\\p{Script=Katakana}ー]{1,6}?\\s*)?",
      nouns:
        "ファイルフォーマット|ファイル形式|フォーマット|形式|プロバイダー|プロバイダ|サブコマンド|コマンド",
    },
  },
  "SPELLED_COUNTS",
  LOCALES,
);

function countPattern(locale) {
  const { numbers, counters, nouns, wago, filler } = SPELLED_COUNTS[locale];
  if (wago !== undefined) {
    return new RegExp(
      `(?<![\\p{N}\\p{Script=Han}])(?:(?:${numbers})\\s*(?:(?:${counters})|(?=の))|${wago})\\s*${filler}(?:${nouns})`,
      "gu",
    );
  }
  if (counters !== undefined) {
    return new RegExp(
      `(?<![\\p{N}一二三四五六七八九十两])(?:${numbers})\\s*(?:${counters})\\s*(?:[A-Za-z]+\\s*|\\p{Script=Han}{1,3})?\\s*(?:${nouns})`,
      "gu",
    );
  }
  return new RegExp(
    `(?<![\\p{L}-])(?:${numbers})\\s+(?:[\\p{L}-]+\\s+)?(?:${nouns})(?![\\p{L}-])`,
    "giu",
  );
}

function proseLines(source) {
  const lines = [];
  let fenced = false;
  for (const line of source.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
    } else if (!fenced) {
      lines.push(line);
    }
  }
  return lines;
}

function spelledCounts(source, locale) {
  const pattern = countPattern(locale);
  return proseLines(source).flatMap((line) => [...line.matchAll(pattern)].map(([match]) => match));
}

const PAGES = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".mdx"))
  .sort();

const MESSAGE_FILES = readdirSync(MESSAGES_DIR)
  .filter((file) => new RegExp(`^(${localeAlternation()})\\.json$`).test(file))
  .sort();

function messageStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(messageStrings);
  }
  return [];
}

describe("docs prose never spells out a registry size", () => {
  it("finds pages in every locale", () => {
    for (const locale of Object.keys(SPELLED_COUNTS)) {
      expect(PAGES.filter((file) => localeOfFile(file) === locale).length).toBeGreaterThan(40);
    }
  });

  it.each(PAGES)("%s names no count of formats, providers or commands", (file) => {
    const source = readIncludedSource(join(CONTENT_DIR, file));

    expect(spelledCounts(source, localeOfFile(file))).toEqual([]);
  });
});

describe("docs UI strings never spell out a registry size", () => {
  it("finds a message file per locale", () => {
    expect(MESSAGE_FILES).toEqual(LOCALES.map((locale) => `${locale}.json`).sort());
  });

  it.each(MESSAGE_FILES)("%s names no count of formats, providers or commands", (file) => {
    const messages = JSON.parse(readFileSync(join(MESSAGES_DIR, file), "utf8"));
    const locale = file.replace(/\.json$/, "");

    expect(messageStrings(messages).flatMap((text) => spelledCounts(text, locale))).toEqual([]);
  });
});

describe("the spelled-count rule", () => {
  const FLAGGED_SAMPLES = [
    ["en", "verbatra reads fourteen formats and translates through six providers."],
    ["en", "Fifteen commands do the work, including five hosted providers."],
    ["de", "Er deckt die fünf gehosteten Provider ab und liest vierzehn Formate."],
    ["es", "Se soportan catorce formatos y quince comandos."],
    ["fr", "Il embarque sept fournisseurs et quinze sous-commandes."],
    ["zh-CN", "支持七个提供商和十四种文件格式。"],
    ["zh-CN", "共有十五个子命令，其中七个命令会调用提供商。"],
    ["zh-CN", "它支持八家提供商。"],
    ["zh-CN", "它读取十四种内置格式。"],
    ["zh-CN", "其中七个 LLM 提供商共用一层。"],
    ["zh-CN", "命令行有十五个 CLI 命令。"],
    ["pt-BR", "O verbatra lê catorze formatos e quinze comandos."],
    ["pt-BR", "Ele aceita quatorze formatos de arquivo e oito provedores."],
    ["pt-BR", "Ele aceita quatorze formatos e oito provedores."],
    ["pt-BR", "Há dezesseis subcomandos."],
    ["ja", "十四種類のフォーマットをサポートします。"],
    ["ja", "八つのプロバイダーと十五個のサブコマンドがあります。"],
    ["ja", "十四種類の組み込みフォーマットを読み込みます。"],
    ["ja", "七つの LLM プロバイダーが 1 つの層を共有します。"],
    ["ja", "CLI には十五のコマンドがあります。"],
    ["ja", "八社のプロバイダーに対応します。"],
    ["ja", "五つのファイルフォーマットと七つのプロバイダー。"],
  ];

  it("has a flagged sample for every locale", () => {
    expect([...new Set(FLAGGED_SAMPLES.map(([locale]) => locale))].sort()).toEqual(
      [...LOCALES].sort(),
    );
  });

  it.each(FLAGGED_SAMPLES)("flags a spelled registry size in %s: %s", (locale, sentence) => {
    expect(spelledCounts(sentence, locale).length).toBeGreaterThan(0);
  });

  it.each([
    ["en", "Two commands start the same server, and the four JSON formats share a parser."],
    ["en", "Pass it once, and the provider answers in seven seconds."],
    ["es", "Once se usa en inglés, pero dos formatos no se crean desde cero."],
    ["en", "```\nfourteen formats inside a code block\n```"],
    ["zh-CN", "这个格式和每个提供商都使用统一格式，第三方提供商除外。"],
    ["zh-CN", "运行 `verbatra check`，用 14 种文件格式和 8 个提供商的数字写法。"],
    ["zh-CN", "```\n十四种格式写在代码块里\n```"],
    ["zh-CN", "三个步骤之后，每家提供商都会回答。"],
    ["pt-BR", "Onze chaves mudaram e dois formatos compartilham um parser."],
    ["pt-BR", "Passe uma vez, e o provedor responde em sete segundos."],
    ["pt-BR", "```\ncatorze formatos dentro de um bloco de código\n```"],
    ["ja", "このフォーマットと各プロバイダーは共通の形式を使います。"],
    [
      "ja",
      "`verbatra check` を実行し、14 種類のフォーマットと 8 つのプロバイダーを数字で書きます。",
    ],
    ["ja", "```\n十四種類のフォーマットをコードブロックに書く\n```"],
    ["ja", "三つの手順の後、各プロバイダーが応答します。"],
    ["ja", "第十四のコマンド"],
    ["ja", "唯一のフォーマットと統一のフォーマットと五つのファイルとプロバイダー。"],
  ])("leaves a small or unrelated count alone in %s: %s", (locale, sentence) => {
    expect(spelledCounts(sentence, locale)).toEqual([]);
  });
});
