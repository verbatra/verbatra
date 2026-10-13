// @vitest-environment jsdom

import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("./global.css", () => ({}));

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Geist: font, Geist_Mono: font };
});

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({ namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale: "en", messages, namespace: namespace as never }),
}));

vi.mock("@/components/site-providers", () => ({
  SiteProviders: ({ children }: { children: ReactNode }) => <div data-providers="">{children}</div>,
}));

vi.mock("@/lib/locale-home-layout", () => ({
  LocaleHomeLayout: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => (
    <div data-home-layout="">
      <main>{children}</main>
      {footer}
    </div>
  ),
}));

vi.mock("@/components/legal-footer", () => ({
  LegalFooter: () => <footer data-legal-footer="" />,
}));

const { default: GlobalNotFound, generateMetadata } = await import("./global-not-found");

async function render(): Promise<Document> {
  const markup = renderToStaticMarkup(await GlobalNotFound());
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("the global not-found page", () => {
  it("renders the site chrome on the dark default with the theme script first", async () => {
    const doc = await render();
    const html = doc.documentElement;
    expect(html.getAttribute("lang")).toBe("en");
    expect(html.className.split(" ")).toContain("dark");
    const first = doc.body.firstElementChild;
    expect(first?.tagName).toBe("SCRIPT");
    const { THEME_INIT_SCRIPT } = await import("@/lib/theme");
    expect(first?.textContent).toBe(THEME_INIT_SCRIPT);
    expect(
      Array.from(
        doc.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]'),
        (meta) => meta.parentElement?.tagName,
      ),
    ).toEqual(["NOSCRIPT", "NOSCRIPT"]);
    expect(await import("./global-not-found")).not.toHaveProperty("viewport");
    expect(
      doc.querySelector("[data-providers] [data-home-layout] [data-legal-footer]"),
    ).not.toBeNull();
  });

  it("names the page and offers the home page and the docs", async () => {
    const doc = await render();
    expect(doc.querySelector("h1")?.textContent).toBe(messages.notFound.title);
    const links = Array.from(doc.querySelectorAll("main a"), (a) => [
      a.getAttribute("href"),
      a.textContent,
    ]);
    expect(links).toEqual([
      ["/", messages.notFound.home],
      ["/docs", messages.notFound.docs],
    ]);
  });

  it("leaves the noindex to Next, which marks every 404 response, so the head has one robots tag", async () => {
    const metadata = await generateMetadata();
    expect(metadata.title).toBe(`${messages.notFound.meta.title} | verbatra`);
    expect(metadata).not.toHaveProperty("robots");
  });
});
