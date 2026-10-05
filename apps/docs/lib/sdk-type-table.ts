import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  type Cache,
  createFileSystemGeneratorCache,
  createGenerator,
  type DocEntry,
  type GeneratedDoc,
  type GenerateOptions,
  type Generator,
  type RemarkAutoTypeTableOptions,
} from "fumadocs-typescript";

const SDK_TYPE_TABLE = "SdkTypeTable";
export const SDK_DECLARATIONS = "packages/sdk/dist/index.d.ts";
export const SDK_TYPE_TABLE_CLASS = "vk-type-table";

const AUTO_TYPE_TABLE = "auto-type-table";
const TYPE_TABLE = "TypeTable";
const SHORT_TYPE_LENGTH = 48;
const OPTIONAL_SUFFIX = " | undefined";
const DEFAULT_LIBRARY_MEMBER = "sdkDefaultLibraryMember";

type MdxAttribute = { type: string; name?: string; value?: unknown };

type MdxNode = {
  type: string;
  name?: string | null;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
  data?: Record<string, unknown>;
};

function isFlowElement(node: MdxNode, name: string): boolean {
  return node.type === "mdxJsxFlowElement" && node.name === name;
}

function visit(node: MdxNode, onNode: (node: MdxNode) => void): void {
  onNode(node);
  for (const child of node.children ?? []) visit(child, onNode);
}

function stringAttribute(node: MdxNode, name: string): string | undefined {
  const value = node.attributes?.find((attribute) => attribute.name === name)?.value;
  return typeof value === "string" ? value : undefined;
}

function uniqueTableId(name: string, seen: Map<string, number>): string {
  const count = (seen.get(name) ?? 0) + 1;
  seen.set(name, count);
  return count === 1 ? `sdk-${name}` : `sdk-${name}-${count}`;
}

function pointAtSdkDeclarations(node: MdxNode, seen: Map<string, number>): void {
  if (!isFlowElement(node, SDK_TYPE_TABLE)) return;
  const name = stringAttribute(node, "name") ?? "";
  node.name = AUTO_TYPE_TABLE;
  node.attributes = [
    ...(node.attributes ?? []).filter(
      (attribute) => !["path", "id", "className"].includes(attribute.name ?? ""),
    ),
    { type: "mdxJsxAttribute", name: "path", value: SDK_DECLARATIONS },
    { type: "mdxJsxAttribute", name: "id", value: uniqueTableId(name, seen) },
    { type: "mdxJsxAttribute", name: "className", value: SDK_TYPE_TABLE_CLASS },
  ];
}

export function remarkSdkTypeTable() {
  return (root: MdxNode) => {
    const seen = new Map<string, number>();
    visit(root, (node) => pointAtSdkDeclarations(node, seen));
  };
}

export function readableType(entry: Pick<DocEntry, "type" | "required">): string | undefined {
  const type =
    !entry.required && entry.type.endsWith(OPTIONAL_SUFFIX)
      ? entry.type.slice(0, -OPTIONAL_SUFFIX.length)
      : entry.type;
  return type.length <= SHORT_TYPE_LENGTH ? type : undefined;
}

type EntryTransform = NonNullable<GenerateOptions["transform"]>;

const simplifyTypeAndTagDefaultLibraryMember: EntryTransform = function tag(entry, _type, symbol) {
  entry.simplifiedType = readableType(entry) ?? entry.simplifiedType;
  const program = this.program.program;
  const declaredOnlyInDefaultLibrary =
    symbol.declarations.length > 0 &&
    symbol.declarations.every(
      (declaration) =>
        program.getSourceFileMetadataByPath(declaration.path)?.isDefaultLibrary === true,
    );
  if (declaredOnlyInDefaultLibrary) entry.tags.push({ name: DEFAULT_LIBRARY_MEMBER, text: "" });
};

export function isDefaultLibraryMember(entry: Pick<DocEntry, "tags">): boolean {
  return entry.tags.some((tag) => tag.name === DEFAULT_LIBRARY_MEMBER);
}

function declaredMembersOnly(doc: GeneratedDoc): GeneratedDoc {
  return { ...doc, entries: doc.entries.filter((entry) => !isDefaultLibraryMember(entry)) };
}

function sdkTypeTableGenerator(cache: Cache | false): Generator {
  const generator = createGenerator({ cache });
  const declaredOnly: Generator = {
    async generateDocumentation(file, name, options) {
      return (await generator.generateDocumentation(file, name, options)).map(declaredMembersOnly);
    },
    generateTypeTable(props, options) {
      return generator.generateTypeTable.call(declaredOnly, props, options);
    },
  };
  return declaredOnly;
}

export function transformCacheKey(sources: readonly unknown[]): string {
  return createHash("sha256").update(sources.map(String).join("\n")).digest("hex").slice(0, 12);
}

const TRANSFORM_SOURCES = [
  simplifyTypeAndTagDefaultLibraryMember,
  readableType,
  SHORT_TYPE_LENGTH,
  OPTIONAL_SUFFIX,
  DEFAULT_LIBRARY_MEMBER,
];

export function sdkTypeTableCacheDirectory(repoRoot: string): string {
  return join(
    repoRoot,
    "apps/docs/.next/fumadocs-typescript",
    transformCacheKey(TRANSFORM_SOURCES),
  );
}

function tableCell(text: string): string {
  return text
    .replace(/\s*\n\s*/g, " ")
    .replaceAll("|", "\\|")
    .trim();
}

export function typeTableMarkdown(doc: Pick<GeneratedDoc, "entries">): string {
  const rows = doc.entries.map((entry) =>
    [
      `\`${entry.name}\``,
      `\`${tableCell(readableType(entry) ?? entry.simplifiedType)}\``,
      entry.required ? "yes" : "no",
      tableCell(entry.description.replace(/{@link ([^}]*)}/g, "$1")),
    ].join(" | "),
  );
  return [
    "| Property | Type | Required | Description |",
    "| --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n");
}

function generatedDoc(node: MdxNode): GeneratedDoc | undefined {
  const type = node.attributes?.find((attribute) => attribute.name === "type")?.value;
  const json =
    typeof type === "object" && type !== null && "value" in type ? type.value : undefined;
  return typeof json === "string" && json !== "" ? (JSON.parse(json) as GeneratedDoc) : undefined;
}

function stringifyAsMarkdownTable(node: MdxNode): void {
  if (!isFlowElement(node, TYPE_TABLE)) return;
  const doc = generatedDoc(node);
  if (doc === undefined) return;
  node.data = { ...node.data, _stringify: { text: typeTableMarkdown(doc) } };
}

export function remarkTypeTableMarkdown() {
  return (root: MdxNode) => visit(root, stringifyAsMarkdownTable);
}

export function sdkTypeTableOptions(
  repoRoot: string,
  cache: Cache | false = createFileSystemGeneratorCache(sdkTypeTableCacheDirectory(repoRoot)),
): RemarkAutoTypeTableOptions & { generator: Generator; options: GenerateOptions } {
  return {
    name: AUTO_TYPE_TABLE,
    generator: sdkTypeTableGenerator(cache),
    options: { basePath: repoRoot, transform: simplifyTypeAndTagDefaultLibraryMember },
  };
}
