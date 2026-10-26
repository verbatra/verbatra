import type { ReactNode } from "react";
import { type HighlightTransformers, highlightLandingCode } from "./landing-highlight";
import { type PlaygroundSnippetLine, snippetHotVar } from "./playground-snippet";

export const SNIPPET_LOCALE_ATTRIBUTE = "data-snippet-locale";

const ROLE_BY_DARK_COLOR: Readonly<Record<string, string>> = {
  "#f97583": "var(--accent)",
  "#9ecbff": "var(--v-status-changed)",
  "#b392f0": "var(--text-strong)",
  "#79b8ff": "var(--text-strong)",
  "#ffab70": "var(--text-strong)",
  "#e1e4e8": "var(--text-strong)",
};

const SHIKI_COLOR = /--shiki-(light|dark):(#[0-9a-f]{6})/giu;

export function recolorToken(style: string): string {
  const dark = /--shiki-dark:(#[0-9a-f]{6})/iu.exec(style)?.[1];
  const role = dark === undefined ? undefined : ROLE_BY_DARK_COLOR[dark.toLowerCase()];
  if (role === undefined) return style;
  return style.replace(SHIKI_COLOR, (_match, theme: string) => `--shiki-${theme}:${role}`);
}

export function snippetLocaleTransformers(
  lines: ReadonlyArray<PlaygroundSnippetLine>,
): HighlightTransformers {
  const localeByLine = new Map<number, string>();
  lines.forEach((line, index) => {
    if (line.locale !== undefined) localeByLine.set(index + 1, line.locale);
  });
  return [
    {
      span(node) {
        const style = node.properties.style;
        if (typeof style === "string") node.properties.style = recolorToken(style);
      },
      line(node, line) {
        const locale = localeByLine.get(line);
        if (locale === undefined) return;
        node.properties[SNIPPET_LOCALE_ATTRIBUTE] = locale;
        node.properties.style = `background-color: var(${snippetHotVar(locale)}, transparent)`;
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

export const LINE_NUMBER_ATTRIBUTE = "data-line";

export const lineNumberTransformer: HighlightTransformers[number] = {
  line(node, line) {
    node.properties[LINE_NUMBER_ATTRIBUTE] = String(line);
  },
};

export function highlightPlaygroundSnippet(
  lines: ReadonlyArray<PlaygroundSnippetLine>,
): Promise<ReactNode> {
  return highlightLandingCode(lines.map((line) => line.text).join("\n"), "ts", [
    ...snippetLocaleTransformers(lines),
    lineNumberTransformer,
  ]);
}
