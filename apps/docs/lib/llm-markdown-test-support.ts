import { compile } from "@mdx-js/mdx";
import { createStringifier } from "fumadocs-core/mdx-plugins/stringifier";

type CompileOptions = NonNullable<Parameters<typeof compile>[1]>;
type RemarkPlugins = NonNullable<CompileOptions["remarkPlugins"]>;
type SourceFile = Parameters<typeof createStringifier>[0];
type SourceTree = Parameters<ReturnType<typeof createStringifier>["stringify"]>[0];

export type LlmMarkdownSource = { value: string; path?: string; data?: Record<string, unknown> };

export async function llmMarkdown(
  source: LlmMarkdownSource,
  remarkPlugins: RemarkPlugins,
): Promise<string> {
  let markdown = "";
  const capture = () => (tree: SourceTree, file: SourceFile) => {
    markdown = createStringifier(file).stringify(tree);
  };
  await compile({ path: "page.mdx", ...source }, { remarkPlugins: [...remarkPlugins, capture] });
  return markdown;
}
