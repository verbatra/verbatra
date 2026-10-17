import { compile } from "@mdx-js/mdx";
import { remarkLLMs } from "fumadocs-core/mdx-plugins/remark-llms";

type CompileOptions = NonNullable<Parameters<typeof compile>[1]>;
export type RemarkPlugins = NonNullable<CompileOptions["remarkPlugins"]>;

type LlmMarkdownSource = { value: string; path?: string; data?: Record<string, unknown> };

export async function llmMarkdown(
  source: LlmMarkdownSource,
  remarkPlugins: RemarkPlugins,
): Promise<string> {
  const file = await compile(
    { path: "page.mdx", ...source },
    { remarkPlugins: [...remarkPlugins, [remarkLLMs, { _data: true }]] },
  );
  const { markdown } = file.data;
  if (typeof markdown !== "string") throw new Error("remarkLLMs wrote no markdown");
  return markdown;
}
