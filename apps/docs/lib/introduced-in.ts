export type IntroducedIn = {
  version: string;
  pkg?: string;
};

type MdxNode = {
  type: string;
  name?: string | null;
  attributes?: readonly unknown[];
};

type MdxRoot = { children: readonly MdxNode[] };

function stringAttribute(node: MdxNode, name: string): string | undefined {
  for (const attribute of node.attributes ?? []) {
    if (typeof attribute !== "object" || attribute === null) continue;
    if (!("type" in attribute) || attribute.type !== "mdxJsxAttribute") continue;
    if (!("name" in attribute) || attribute.name !== name) continue;
    return "value" in attribute && typeof attribute.value === "string"
      ? attribute.value
      : undefined;
  }
  return undefined;
}

export function pageIntroducedIn(root: MdxRoot): IntroducedIn | undefined {
  const firstHeading = root.children.findIndex((node) => node.type === "heading");
  const lead = firstHeading === -1 ? root.children : root.children.slice(0, firstHeading);
  const callout = lead.find(
    (node) => node.type === "mdxJsxFlowElement" && node.name === "AvailableFrom",
  );
  if (callout === undefined) return undefined;
  const version = stringAttribute(callout, "version");
  if (version === undefined) return undefined;
  const pkg = stringAttribute(callout, "pkg");
  return pkg === undefined ? { version } : { version, pkg };
}

export function remarkIntroducedIn() {
  return (root: MdxRoot, file: { data: object }) => {
    const introducedIn = pageIntroducedIn(root);
    if (introducedIn) Object.assign(file.data, { introducedIn });
  };
}

export function readIntroducedIn(exports: unknown): IntroducedIn | undefined {
  if (typeof exports !== "object" || exports === null || !("introducedIn" in exports)) {
    return undefined;
  }
  const value = exports.introducedIn;
  if (typeof value !== "object" || value === null || !("version" in value)) return undefined;
  if (typeof value.version !== "string") return undefined;
  const pkg = "pkg" in value && typeof value.pkg === "string" ? value.pkg : undefined;
  return pkg === undefined ? { version: value.version } : { version: value.version, pkg };
}
