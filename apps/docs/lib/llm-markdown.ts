import { replaceSource } from "fumadocs-core/mdx-plugins/stringifier";

type SourceFile = Parameters<typeof replaceSource>[0];
type SourceNode = Parameters<typeof replaceSource>[1];

export type MarkdownFile = { data: object };
type MarkdownNode = { type: string };

export function replaceMarkdown(file: MarkdownFile, node: MarkdownNode, text: string): void {
  replaceSource(file as SourceFile, node as SourceNode, text);
}

export function keepInnerMarkdown(file: MarkdownFile, node: MarkdownNode): void {
  replaceSource(file as SourceFile, node as SourceNode, (s) => s.inner(node as SourceNode));
}

function longestRun(value: string, char: "`" | "~"): number {
  const runs = value.match(char === "`" ? /`+/g : /~+/g) ?? [];
  return Math.max(0, ...runs.map((run) => run.length));
}

export function fencedMarkdown(
  lang: string | null | undefined,
  meta: string | null | undefined,
  code: string,
): string {
  const info = [lang, meta]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ");
  const char = info.includes("`") ? "~" : "`";
  const fence = char.repeat(Math.max(3, longestRun(code, char) + 1));
  return `${fence}${info}\n${code}\n${fence}`;
}

function needsPadding(value: string): boolean {
  if (value.startsWith("`") || value.endsWith("`")) return true;
  return value.startsWith(" ") && value.endsWith(" ") && value.trim() !== "";
}

export function inlineCodeMarkdown(value: string): string {
  if (value === "") return "";
  const ticks = "`".repeat(longestRun(value, "`") + 1);
  const padding = needsPadding(value) ? " " : "";
  return `${ticks}${padding}${value}${padding}${ticks}`;
}
