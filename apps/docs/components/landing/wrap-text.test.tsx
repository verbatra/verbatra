import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { keepsWhole, WrapTokens, wrapLineStyle } from "./wrap-text";

describe("WrapTokens", () => {
  it("keeps a placeholder token whole and leaves a plain word free to wrap", () => {
    const html = renderToStaticMarkup(<WrapTokens text="{name} sent (-{count}) messages" />);
    expect(html).toContain('<span class="whitespace-nowrap">{name}</span>');
    expect(html).toContain('<span class="whitespace-nowrap">(-{count})</span>');
    expect(html).not.toContain('<span class="whitespace-nowrap">sent</span>');
    expect(html).toContain(" sent ");
  });

  it("recognises a placeholder anywhere inside a token", () => {
    expect(keepsWhole('"{count}')).toBe(true);
    expect(keepsWhole("count")).toBe(false);
  });
});

describe("wrapLineStyle", () => {
  it("measures the leading whitespace in ch", () => {
    expect(wrapLineStyle("  x")).toEqual({ "--wrap-lead": "2ch" });
    expect(wrapLineStyle("x")).toEqual({ "--wrap-lead": "0ch" });
  });
});
