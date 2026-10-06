import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

export type DocsPage = { readonly file: string; readonly source: string };

export type ReadFile = (absolutePath: string) => string;

export type CommitTimeMap = Readonly<Record<string, number>>;

const TRANSLATION_FILE = /^(.*)\.[a-z]{2}\.mdx$/;
const INCLUDE = /^<include>([^<]+)<\/include>[ \t]*$/gm;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;

const readUtf8: ReadFile = (absolutePath) => readFileSync(absolutePath, "utf8");

export function includedFiles(file: string, source: string): string[] {
  return [...source.matchAll(INCLUDE)].map(([, target = ""]) =>
    normalize(join(dirname(file), target.trim())),
  );
}

export function includedSource(
  absolutePath: string,
  source: string,
  read: ReadFile = readUtf8,
  seen: ReadonlySet<string> = new Set([absolutePath]),
): string {
  return source.replace(INCLUDE, (_line, target: string) => {
    const included = join(dirname(absolutePath), target.trim());
    if (seen.has(included)) throw new Error(`${included} includes itself`);
    const body = read(included).replace(FRONTMATTER, "");
    return includedSource(included, body, read, new Set([...seen, included])).trimEnd();
  });
}

export function readIncludedSource(absolutePath: string): string {
  return includedSource(absolutePath, readUtf8(absolutePath));
}

export function foldIncludedTimes(
  times: CommitTimeMap,
  pagesDir: string,
  readSource: (file: string) => string | undefined,
): Record<string, number> {
  const prefix = `${pagesDir}/`;
  const folded: Record<string, number> = {};
  for (const [file, time] of Object.entries(times)) {
    if (!file.startsWith(prefix)) continue;
    const source = readSource(file);
    const includes = source === undefined ? [] : includedFiles(file, source);
    folded[file.slice(prefix.length)] = Math.max(
      time,
      ...includes.map((include) => times[include] ?? 0),
    );
  }
  return folded;
}

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
    .map((file) => ({ file, source: readIncludedSource(join(contentDir, file)) }));
}
