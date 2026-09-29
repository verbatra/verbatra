// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n, type Locale, localizedPath } from "@/lib/i18n";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../messages");
const localeState = vi.hoisted(() => ({ current: "en" }));

function translatorFor(locale: string, namespace: string) {
  return createTranslator({
    locale,
    messages: JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")),
    namespace: namespace as never,
  });
}

vi.mock("next-intl/server", () => ({
  getTranslations: async (options: string | { locale: string; namespace: string }) =>
    typeof options === "string"
      ? translatorFor(localeState.current, options)
      : translatorFor(options.locale, options.namespace),
  getLocale: async () => localeState.current,
}));
vi.mock("@/components/site-header", () => ({
  HomeSiteHeader: () => <header>site header</header>,
  DocsSiteHeader: () => <header>site header</header>,
}));
vi.mock("@/lib/layout.shared", () => ({
  baseOptions: async () => ({}),
}));
vi.mock("fumadocs-ui/layouts/notebook", () => ({
  DocsLayout: ({ children }: { children: ReactNode }) => (
    <div id="nd-notebook-layout">{children}</div>
  ),
}));
vi.mock("@/lib/source", () => ({
  source: { getPageTree: () => ({ name: "docs", children: [] }) },
}));
vi.mock("@/lib/docs-page-tree", () => ({
  rootTabs: () => [],
  withExpandedNewGroups: <T,>(tree: T) => tree,
  withLlmsLinks: async <T,>(tree: T) => tree,
}));
vi.mock("@/lib/docs-status-badges", () => ({
  withStatusBadges: async <T,>(tree: T) => tree,
}));
vi.mock("@/lib/docs-group-labels", () => ({
  withGroupLabels: <T,>(tree: T) => tree,
}));

type Layout = (props: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) => ReactNode | Promise<ReactNode>;

const LAYOUTS: ReadonlyArray<readonly [string, Layout]> = [
  ["home", (await import("./(home)/layout")).default],
  ["docs", (await import("./docs/layout")).default],
  ["legal", (await import("./(legal)/layout")).default],
];

const IMPRINT_LABEL: Record<Locale, string> = {
  en: "Imprint",
  de: "Impressum",
  es: "Aviso legal",
  fr: "Mentions légales",
};

type AnyProps = Record<string, unknown> & { children?: ReactNode; footer?: ReactNode };

function isAsyncComponent(type: unknown): type is (props: AnyProps) => Promise<ReactNode> {
  return typeof type === "function" && type.constructor.name === "AsyncFunction";
}

async function resolveServer(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServer));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<AnyProps>;
  if (isAsyncComponent(element.type)) return resolveServer(await element.type(element.props));
  const overrides: Partial<AnyProps> = {};
  if (element.props.children !== undefined) {
    overrides.children = await resolveServer(element.props.children);
  }
  if (element.props.footer !== undefined) {
    overrides.footer = await resolveServer(element.props.footer);
  }
  return cloneElement(element, overrides);
}

async function renderLayout(layout: Layout, locale: Locale): Promise<Document> {
  localeState.current = locale;
  const tree = await resolveServer(
    await layout({ params: Promise.resolve({ lang: locale }), children: <p>page body</p> }),
  );
  return new DOMParser().parseFromString(renderToStaticMarkup(tree), "text/html");
}

describe.each(i18n.languages)("every layout links the imprint (%s)", (locale) => {
  it.each(LAYOUTS)("the %s layout renders a labelled imprint link", async (_name, layout) => {
    const doc = await renderLayout(layout, locale);
    const links = Array.from(
      doc.querySelectorAll(`footer a[href="${localizedPath(locale, "/imprint")}"]`),
    );

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.textContent?.trim()).toBe(IMPRINT_LABEL[locale]);
      expect(link.closest("main")).toBeNull();
    }
  });
});

describe("the compact legal footer", () => {
  it.each(LAYOUTS.filter(([name]) => name !== "home"))(
    "gives the %s layout imprint, privacy and contact links in the reader's locale",
    async (_name, layout) => {
      const doc = await renderLayout(layout, "de");
      const links = Array.from(doc.querySelectorAll("footer nav a"), (link) => [
        link.getAttribute("href"),
        link.textContent,
      ]);

      expect(links).toEqual([
        ["/de/imprint", "Impressum"],
        ["/de/privacy", "Datenschutzerklärung"],
        ["/de/contact", "Kontakt"],
      ]);
      expect(doc.querySelector("footer nav")?.getAttribute("aria-label")).toBe("Rechtliches");
    },
  );
});
