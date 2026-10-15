import { replaceSource } from "fumadocs-core/mdx-plugins/stringifier";

type SourceFile = Parameters<typeof replaceSource>[0];
type SourceNode = Parameters<typeof replaceSource>[1];

type MarkdownFile = { data: object };
type MarkdownNode = { type: string };

export function replaceMarkdown(file: MarkdownFile, node: MarkdownNode, text: string): void {
  replaceSource(file as SourceFile, node as SourceNode, text);
}

export function keepInnerMarkdown(file: MarkdownFile, node: MarkdownNode): void {
  replaceSource(file as SourceFile, node as SourceNode, (s) => s.inner(node as SourceNode));
}

function longestBacktickRun(value: string): number {
  return Math.max(0, ...[...value.matchAll(/`+/g)].map(([run]) => run.length));
}

export function fencedMarkdown(
  lang: string | null | undefined,
  meta: string | null | undefined,
  code: string,
): string {
  const info = [lang, meta]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ");
  const fence = "`".repeat(Math.max(3, longestBacktickRun(code) + 1));
  return `${fence}${info}\n${code}\n${fence}`;
}

export function inlineCodeMarkdown(value: string): string {
  const ticks = "`".repeat(longestBacktickRun(value) + 1);
  const padding = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${ticks}${padding}${value}${padding}${ticks}`;
}
