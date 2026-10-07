import { isDocsPath, markdownUrl } from "@/lib/markdown-route";
import { SITE_URL } from "@/lib/site";

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[^`][\s\S]*?\1|(`+)/g;
const SITE_RELATIVE = "\\/(?!\\/)[^\\s)\"'#?]*(?:[?#][^\\s)\"']*)?";
const LINK_TARGET = new RegExp(
  `(\\]\\(\\s*|\\bhref=["']|^\\s*\\[[^\\]]+\\]:\\s*)(${SITE_RELATIVE})`,
  "g",
);

export function absoluteMarkdownHref(href: string): string {
  const split = href.search(/[?#]/);
  const path = split === -1 ? href : href.slice(0, split);
  const suffix = split === -1 ? "" : href.slice(split);
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const target = isDocsPath(trimmed) ? markdownUrl(trimmed) : path;
  return `${new URL(target, SITE_URL).href}${suffix}`;
}

function rewriteProse(text: string): string {
  return text.replace(
    LINK_TARGET,
    (_match, lead: string, href: string) => `${lead}${absoluteMarkdownHref(href)}`,
  );
}

function rewriteLine(line: string): string {
  let result = "";
  let last = 0;
  for (const match of line.matchAll(INLINE_CODE)) {
    result += rewriteProse(line.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return result + rewriteProse(line.slice(last));
}

function closesFence(line: string, open: string): boolean {
  const fence = FENCE.exec(line)?.[1];
  return (
    fence !== undefined &&
    fence[0] === open[0] &&
    fence.length >= open.length &&
    line.trim() === fence
  );
}

export function absolutizeMarkdownLinks(markdown: string): string {
  let openFence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      if (openFence !== undefined) {
        if (closesFence(line, openFence)) openFence = undefined;
        return line;
      }
      const fence = FENCE.exec(line)?.[1];
      if (fence !== undefined) {
        openFence = fence;
        return line;
      }
      return rewriteLine(line);
    })
    .join("\n");
}
