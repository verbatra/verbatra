import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import { extractFaqItems, withoutQuestions } from "./extract-faq";
import { i18n } from "./i18n";

describe("extractFaqItems", () => {
  it("returns an empty array for empty content", () => {
    expect(extractFaqItems("")).toEqual([]);
  });

  it("returns an empty array when the content has no H2 sections", () => {
    expect(extractFaqItems("Just a paragraph, no heading.\n")).toEqual([]);
  });

  it("extracts a question and answer pair from each H2 section", () => {
    const markdown = [
      "## What is verbatra? [#what-is-verbatra]",
      "verbatra is a tool.",
      "",
      "## How do I install it?",
      "Run `npm i -D @verbatra/cli` to install.",
      "",
    ].join("\n");

    expect(extractFaqItems(markdown)).toEqual([
      { question: "What is verbatra?", answer: "verbatra is a tool." },
      { question: "How do I install it?", answer: "Run npm i -D @verbatra/cli to install." },
    ]);
  });

  it("strips the Fumadocs anchor suffix from an anchored heading", () => {
    const markdown = "## Some question? [#some-question]\nAn answer.\n";
    expect(extractFaqItems(markdown)[0]?.question).toBe("Some question?");
  });

  it("resolves links, inline code, and bullets in the answer to plain text", () => {
    const markdown = [
      "## Reference [#reference]",
      "See the [config guide](/docs/config-file) and run `verbatra diff`.",
      "",
      "* item one",
      "* item two",
      "",
    ].join("\n");

    expect(extractFaqItems(markdown)).toEqual([
      {
        question: "Reference",
        answer: "See the config guide and run verbatra diff. - item one - item two",
      },
    ]);
  });

  it("skips a heading with no body text", () => {
    const markdown = "## Empty section\n## Real question\nReal answer.\n";
    expect(extractFaqItems(markdown)).toEqual([
      { question: "Real question", answer: "Real answer." },
    ]);
  });

  it("skips a heading with no trailing newline", () => {
    expect(extractFaqItems("## Just a heading")).toEqual([]);
  });
});

describe("withoutQuestions", () => {
  it("drops the items whose question is already marked up elsewhere and keeps the order", () => {
    const items = [
      { question: "A?", answer: "a" },
      { question: "B?", answer: "b" },
      { question: "C?", answer: "c" },
    ];
    expect(withoutQuestions(items, ["B?"])).toEqual([items[0], items[2]]);
  });
});

describe("the docs FAQ markup next to the home FAQ", () => {
  const catalogs = { en, de, es, fr } as const;

  it.each(i18n.languages)("repeats no home question once the overlap is dropped (%s)", (locale) => {
    const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
    const page = readFileSync(
      new URL(`../content/docs/(help)/faq${suffix}.mdx`, import.meta.url),
      "utf8",
    );
    const home = Object.values(catalogs[locale].landing.faq.items).map((item) => item.question);
    const docs = extractFaqItems(page);
    const marked = withoutQuestions(docs, home);
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.filter((item) => home.includes(item.question))).toEqual([]);
  });
});
