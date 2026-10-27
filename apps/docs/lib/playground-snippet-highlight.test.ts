import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYGROUND_LANGUAGES, PLAYGROUND_SNIPPET_CONFIG } from "./landing-playground";
import { playgroundSnippetLines, snippetHotVar } from "./playground-snippet";
import {
  highlightPlaygroundSnippet,
  LINE_NUMBER_ATTRIBUTE,
  lineNumberTransformer,
  recolorToken,
  SNIPPET_LOCALE_ATTRIBUTE,
  snippetLocaleTransformers,
} from "./playground-snippet-highlight";

type LineHook = (this: unknown, node: unknown, line: number) => void;

function styled(lines: Parameters<typeof snippetLocaleTransformers>[0], number: number) {
  const hook = snippetLocaleTransformers(lines)[0]?.line as LineHook | undefined;
  if (hook === undefined) throw new Error("no line hook");
  const node = { properties: {} as Record<string, unknown> };
  hook.call({}, node, number);
  return node.properties;
}

describe("snippetLocaleTransformers", () => {
  const lines = playgroundSnippetLines(PLAYGROUND_SNIPPET_CONFIG, PLAYGROUND_LANGUAGES);

  it("tags exactly the locale lines with their language and a hot-line background hook", () => {
    const tagged = lines.flatMap((line, index) =>
      line.locale === undefined ? [] : [{ number: index + 1, locale: line.locale }],
    );
    expect(tagged.map((entry) => entry.locale)).toEqual([...PLAYGROUND_LANGUAGES]);
    for (const { number, locale } of tagged) {
      expect(styled(lines, number)).toEqual({
        [SNIPPET_LOCALE_ATTRIBUTE]: locale,
        style: `background-color: var(${snippetHotVar(locale)}, transparent)`,
      });
    }
  });

  it("leaves every other line untouched", () => {
    expect(styled(lines, 1)).toEqual({});
  });
});

describe("recolorToken", () => {
  it("maps keywords to the accent and strings to the changed-status token in both themes", () => {
    expect(recolorToken("--shiki-light:#D73A49;--shiki-dark:#F97583")).toBe(
      "--shiki-light:var(--accent);--shiki-dark:var(--accent)",
    );
    expect(recolorToken("--shiki-light:#032F62;--shiki-dark:#9ECBFF")).toBe(
      "--shiki-light:var(--v-status-changed);--shiki-dark:var(--v-status-changed)",
    );
  });

  it("maps identifiers and constants to the strong text token", () => {
    expect(recolorToken("--shiki-light:#6F42C1;--shiki-dark:#B392F0")).toBe(
      "--shiki-light:var(--text-strong);--shiki-dark:var(--text-strong)",
    );
  });

  it("leaves a color it has no role for alone", () => {
    const comment = "--shiki-light:#6A737D;--shiki-dark:#6A737D";
    expect(recolorToken(comment)).toBe(comment);
    expect(recolorToken("color:red")).toBe("color:red");
  });
});

describe("highlightPlaygroundSnippet", () => {
  it("renders no github palette color into the playground snippet", async () => {
    const lines = playgroundSnippetLines(PLAYGROUND_SNIPPET_CONFIG, PLAYGROUND_LANGUAGES);
    const html = renderToStaticMarkup(await highlightPlaygroundSnippet(lines));
    expect(html).not.toMatch(/#F97583|#9ECBFF|#D73A49|#032F62/i);
    expect(html).toContain("var(--accent)");
    expect(html).toContain("var(--v-status-changed)");
  });
});

describe("lineNumberTransformer", () => {
  it("stamps each line with its one-based number", () => {
    const node = { properties: {} as Record<string, unknown> };
    (lineNumberTransformer.line as LineHook).call({}, node, 7);
    expect(node.properties).toEqual({ [LINE_NUMBER_ATTRIBUTE]: "7" });
  });

  it("numbers every rendered line of the snippet", async () => {
    const lines = playgroundSnippetLines(PLAYGROUND_SNIPPET_CONFIG, PLAYGROUND_LANGUAGES);
    const html = renderToStaticMarkup(await highlightPlaygroundSnippet(lines));
    expect(html.match(/data-line="/g)).toHaveLength(lines.length);
  });
});
