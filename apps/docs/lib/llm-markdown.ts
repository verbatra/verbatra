import { replaceSource } from "fumadocs-core/mdx-plugins/stringifier";

type SourceFile = Parameters<typeof replaceSource>[0];
type SourceNode = Parameters<typeof replaceSource>[1];

export function replaceMarkdown(file: object, node: object, text: string): void {
  replaceSource(file as SourceFile, node as SourceNode, text);
}

export function keepInnerMarkdown(file: object, node: object): void {
  replaceSource(file as SourceFile, node as SourceNode, (s) => s.inner(node as SourceNode));
}

export function fencedMarkdown(
  lang: string | null | undefined,
  meta: string | null | undefined,
  code: string,
): string {
  const info = [lang, meta]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ");
  return `\`\`\`${info}\n${code}\n\`\`\``;
}
