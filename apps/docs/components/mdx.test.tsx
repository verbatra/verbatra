// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMDXComponents, OUTPUT_BLOCK_TITLE, OUTPUT_CODE_CLASS } from "./mdx";

type PreProps = { title?: string; className?: string; children: ReactNode };

function renderPre(title?: string): HTMLElement {
  const Pre = getMDXComponents("en").pre as ComponentType<PreProps>;
  const markup = renderToStaticMarkup(
    <Pre className="shiki" {...(title === undefined ? {} : { title })}>
      <code>verbatra: translating de</code>
    </Pre>,
  );
  const figure = new DOMParser().parseFromString(markup, "text/html").querySelector("figure");
  if (figure === null) throw new Error("no code block rendered");
  return figure;
}

describe("pre mapping", () => {
  it("marks an Output block and drops its copy button, so results read apart from commands", () => {
    const figure = renderPre(OUTPUT_BLOCK_TITLE);

    expect(figure.classList.contains(OUTPUT_CODE_CLASS)).toBe(true);
    expect(figure.querySelector("figcaption")?.textContent).toBe(OUTPUT_BLOCK_TITLE);
    expect(figure.querySelector("button")).toBeNull();
  });

  it("leaves command and file blocks copyable", () => {
    for (const figure of [renderPre("verbatra.config.ts"), renderPre()]) {
      expect(figure.classList.contains(OUTPUT_CODE_CLASS)).toBe(false);
      expect(figure.querySelector("button")).not.toBeNull();
      expect(figure.classList.contains("shiki")).toBe(true);
    }
  });
});
