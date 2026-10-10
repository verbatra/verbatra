import type { TOCItemType } from "fumadocs-core/toc";
import { isValidElement, type ReactNode } from "react";

export type SdkHeading = { anchor: string; title: string; depth: number };

export type SdkReferencePage = { url: string; title: string; headings: readonly SdkHeading[] };

export type SdkAnchorTargets = Readonly<Record<string, string>>;

const IDENTIFIER = /^(?:[a-z][A-Za-z0-9]*|[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*)$/;

function decodeAnchor(anchor: string): string {
  try {
    return decodeURIComponent(anchor);
  } catch {
    return anchor;
  }
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export function tocHeading(item: TOCItemType): SdkHeading {
  const anchor = decodeAnchor(item.url.replace(/^#/, ""));
  return {
    anchor,
    title: textOf(item.title) || anchor,
    depth: item.depth,
  };
}

export function isIdentifier(title: string): boolean {
  return IDENTIFIER.test(title);
}

export function entryHeadings(page: SdkReferencePage): SdkHeading[] {
  return page.headings.filter((heading) => heading.depth === 3);
}

export function sdkAnchorTargets(pages: readonly SdkReferencePage[]): SdkAnchorTargets {
  const targets: Record<string, string> = {};
  for (const page of pages) {
    for (const { anchor } of page.headings) {
      targets[anchor] ??= page.url;
    }
  }
  return targets;
}

export function forwardedUrl(
  hash: string,
  targets: SdkAnchorTargets,
  isOnPage: (anchor: string) => boolean,
): string | undefined {
  const anchor = decodeAnchor(hash.replace(/^#/, ""));
  if (anchor === "" || isOnPage(anchor)) return undefined;
  const url = targets[anchor];
  return url === undefined ? undefined : `${url}#${anchor}`;
}
