import type { ReactNode } from "react";
import { type HighlightTransformers, highlightLandingCode } from "./landing-highlight";
import { type PlaygroundSnippetLine, snippetLocaleVar } from "./playground-snippet";

export const SNIPPET_LOCALE_ATTRIBUTE = "data-snippet-locale";

export function snippetLocaleTransformers(
  lines: ReadonlyArray<PlaygroundSnippetLine>,
): HighlightTransformers {
  const localeByLine = new Map<number, string>();
  lines.forEach((line, index) => {
    if (line.locale !== undefined) localeByLine.set(index + 1, line.locale);
  });
  return [
    {
      line(node, line) {
        const locale = localeByLine.get(line);
        if (locale === undefined) return;
        node.properties[SNIPPET_LOCALE_ATTRIBUTE] = locale;
        node.properties.style = `display: var(${snippetLocaleVar(locale)}, inline)`;
      },
      code(node) {
        node.children.forEach((child, index) => {
          const next = node.children[index + 1];
          if (
            child.type !== "element" ||
            child.properties[SNIPPET_LOCALE_ATTRIBUTE] === undefined
          ) {
            return;
          }
          if (next?.type !== "text" || !next.value.startsWith("\n")) return;
          next.value = next.value.slice(1);
          child.children.push({ type: "text", value: "\n" });
        });
      },
    },
  ];
}

export function highlightPlaygroundSnippet(
  lines: ReadonlyArray<PlaygroundSnippetLine>,
): Promise<ReactNode> {
  return highlightLandingCode(
    lines.map((line) => line.text).join("\n"),
    "ts",
    snippetLocaleTransformers(lines),
  );
}
