import {
  parseCodeBlockAttributes,
  type RehypeCodeOptions,
  rehypeCodeDefaultOptions,
} from "fumadocs-core/mdx-plugins";

const OUTPUT_META_FLAG = "output";
export const OUTPUT_ATTRIBUTE = "data-output";

type ParseMetaString = NonNullable<RehypeCodeOptions["parseMetaString"]>;
type CodeBlockMeta = Record<string, unknown>;

export function parseCodeBlockMeta(
  ...[meta, node, tree]: Parameters<ParseMetaString>
): CodeBlockMeta {
  const { rest, attributes } = parseCodeBlockAttributes(meta, [OUTPUT_META_FLAG]);
  const data: CodeBlockMeta = rehypeCodeDefaultOptions.parseMetaString?.(rest, node, tree) ?? {
    __raw: rest,
  };
  if (OUTPUT_META_FLAG in attributes) data[OUTPUT_ATTRIBUTE] = true;
  return data;
}

export const rehypeCodeOptions: RehypeCodeOptions = {
  ...rehypeCodeDefaultOptions,
  parseMetaString: parseCodeBlockMeta,
};
