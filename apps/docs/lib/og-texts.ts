import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LOCALE, type Locale, translationFilePattern } from "./locales.ts";

interface MessageTree {
  [key: string]: string | MessageTree;
}

const ACCENT_TAGS = /<\/?accent>/g;

function message(tree: MessageTree, path: readonly string[]): string {
  let node: string | MessageTree | undefined = tree;
  for (const key of path) node = typeof node === "object" ? node[key] : undefined;
  if (typeof node !== "string") throw new Error(`no message at ${path.join(".")}`);
  return node;
}

function frontmatterTexts(source: string): string[] {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1] ?? "";
  return Array.from(
    frontmatter.matchAll(/^(?:title|description): (.*)$/gm),
    (match) => match[1] ?? "",
  );
}

function pagesOf(locale: Locale, files: readonly string[]): string[] {
  const translation = translationFilePattern();
  return files.filter((file) => {
    if (!file.endsWith(".mdx")) return false;
    if (locale === DEFAULT_LOCALE) return !translation.test(file);
    return file.endsWith(`.${locale}.mdx`);
  });
}

export function ogTexts(locale: Locale, root: string): string[] {
  const catalog = JSON.parse(
    readFileSync(join(root, "messages", `${locale}.json`), "utf8"),
  ) as MessageTree;
  const contentDir = join(root, "content/docs");
  const files = readdirSync(contentDir, { recursive: true, encoding: "utf8" });
  return [
    message(catalog, ["landing", "banner", "headline"]).replace(ACCENT_TAGS, ""),
    ...pagesOf(locale, files).flatMap((file) =>
      frontmatterTexts(readFileSync(join(contentDir, file), "utf8")),
    ),
  ];
}

export function ogCharacters(texts: readonly string[]): string {
  const unique = new Set<string>();
  for (const char of texts.join("")) if (/\S/u.test(char)) unique.add(char);
  return [...unique].join("");
}
