import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type DocsPage = { readonly file: string; readonly source: string };

const TRANSLATION_FILE = /^(.*)\.[a-z]{2}\.mdx$/;

function isTranslation(file: string, files: ReadonlySet<string>): boolean {
  const base = TRANSLATION_FILE.exec(file)?.[1];
  return base !== undefined && files.has(`${base}.mdx`);
}

export function englishDocsPages(contentDir: string): DocsPage[] {
  const files = readdirSync(contentDir, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith(".mdx"),
  );
  const all = new Set(files);
  return files
    .filter((file) => !isTranslation(file, all))
    .sort()
    .map((file) => ({ file, source: readFileSync(join(contentDir, file), "utf8") }));
}
