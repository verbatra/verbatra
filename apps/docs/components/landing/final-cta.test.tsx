// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import en from "@/messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "de",
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { FinalCta } = await import("./final-cta");

const copy = en.landing.closing;

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {await FinalCta()}
    </NextIntlClientProvider>,
  );
});

describe("FinalCta", () => {
  it("closes on the closing copy", () => {
    expect(root.querySelector("h2")?.textContent).toBe(copy.heading);
    expect(root.textContent).toContain(copy.lead);
  });

  it("keeps the install command and both buttons in the reader's locale", () => {
    expect(root.querySelector("code")?.textContent).toBe(NPM_INSTALL_COMMAND);
    expect(root.querySelector("a[href='/de/docs/quickstart']")?.textContent).toBe(copy.primary);
    expect(root.querySelector("a[href='/de/docs']")?.textContent).toBe(copy.secondary);
  });

  it("keeps a full section of space between the panel and the footer", () => {
    const classes = root.querySelector("section")?.className.split(" ") ?? [];
    expect(classes).toContain("vk-pad-sm");
    expect(classes.filter((name) => /^p[bt]-/.test(name))).toEqual([]);
  });
});
