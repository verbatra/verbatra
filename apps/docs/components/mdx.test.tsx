// @vitest-environment jsdom

import { type ComponentProps, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OUTPUT_ATTRIBUTE } from "@/lib/code-block-meta";
import { i18n, type Locale } from "@/lib/i18n";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";

const MESSAGES = { en, de, es, fr } as const;

vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ locale }: { locale: Locale }) =>
    (key: "output") =>
      MESSAGES[locale].docs.codeBlock[key],
}));

const { getMDXComponents } = await import("./mdx");
const { OUTPUT_CODE_CLASS, OutputCodeBlock } = await import("./output-code-block");

type PreProps = { title?: string; className?: string; children: ReactNode } & {
  [OUTPUT_ATTRIBUTE]?: boolean;
};

async function renderPre(locale: Locale, props: Omit<PreProps, "children">): Promise<HTMLElement> {
  const Pre = getMDXComponents(locale).pre as (props: PreProps) => ReactNode;
  const element = Pre({
    className: "shiki",
    ...props,
    children: <code>verbatra: translating de</code>,
  });
  const resolved = await resolveAsync(element);
  const markup = renderToStaticMarkup(resolved);
  const figure = new DOMParser().parseFromString(markup, "text/html").querySelector("figure");
  if (figure === null) throw new Error("no code block rendered");
  return figure;
}

async function resolveAsync(element: ReactNode): Promise<ReactNode> {
  if (!isValidElement<ComponentProps<typeof OutputCodeBlock>>(element)) return element;
  if (element.type !== OutputCodeBlock) return element;
  return OutputCodeBlock(element.props);
}

describe("pre mapping", () => {
  it("marks an output block and drops its copy button, so results read apart from commands", async () => {
    const figure = await renderPre("en", { [OUTPUT_ATTRIBUTE]: true });

    expect(figure.classList.contains(OUTPUT_CODE_CLASS)).toBe(true);
    expect(figure.querySelector("figcaption")?.textContent).toBe("Output");
    expect(figure.querySelector("button")).toBeNull();
  });

  it("labels an output block in the page's own language", async () => {
    const labels = await Promise.all(
      i18n.languages.map(async (locale) => {
        const figure = await renderPre(locale, { [OUTPUT_ATTRIBUTE]: true });
        return figure.querySelector("figcaption")?.textContent;
      }),
    );

    expect(labels).toEqual(i18n.languages.map((locale) => MESSAGES[locale].docs.codeBlock.output));
    expect(new Set(labels).size).toBe(i18n.languages.length);
  });

  it("keeps a block titled Output an ordinary copyable block, since only the flag marks output", async () => {
    const figure = await renderPre("de", { title: "Output" });

    expect(figure.classList.contains(OUTPUT_CODE_CLASS)).toBe(false);
    expect(figure.querySelector("button")).not.toBeNull();
  });

  it("leaves command and file blocks copyable", async () => {
    for (const figure of [
      await renderPre("en", { title: "verbatra.config.ts" }),
      await renderPre("en", {}),
    ]) {
      expect(figure.classList.contains(OUTPUT_CODE_CLASS)).toBe(false);
      expect(figure.querySelector("button")).not.toBeNull();
      expect(figure.classList.contains("shiki")).toBe(true);
    }
  });
});
