// @vitest-environment jsdom

import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const homeLayout = vi.hoisted(() => ({
  current: undefined as unknown,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `nav.${key}`,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => `cta.${key}` }));
const location = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("fumadocs-core/framework", () => ({ usePathname: () => location.pathname }));
vi.mock("fumadocs-core/link", () => ({
  default: ({
    children,
    external: _external,
    ...props
  }: ComponentProps<"a"> & { external?: boolean }) => <a {...props}>{children}</a>,
}));
vi.mock("fumadocs-ui/layouts/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("fumadocs-ui/layouts/shared")>()),
  LinkItem: ({ item, children, ...props }: ComponentProps<"a"> & { item: { url: string } }) => (
    <a href={item.url} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("fumadocs-ui/layouts/home", () => ({ useHomeLayout: () => homeLayout.current }));
vi.mock("fumadocs-ui/layouts/notebook", () => ({ useNotebookLayout: () => ({}) }));
vi.mock("@/components/root-tabs", () => ({ useRootTabs: () => ({ tabs: [] }) }));
vi.mock("fumadocs-ui/components/sidebar/base", () => {
  const passThrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    SidebarProvider: passThrough,
    SidebarViewport: passThrough,
    SidebarDrawerOverlay: () => null,
    SidebarTrigger: ({ children }: { children?: ReactNode }) => (
      <button type="button" data-sidebar-trigger>
        {children}
      </button>
    ),
    SidebarDrawerContent: ({ children }: { children?: ReactNode }) => (
      <div data-drawer>{children}</div>
    ),
    useSidebar: () => ({ open: false, mode: "drawer", setOpen: () => undefined }),
  };
});

const { baseOptions } = await import("./layout.shared");
const { releaseUrl } = await import("@/components/landing/links");
const { PACKAGE_VERSION } = await import("@/lib/site");
const { docsStylesheetRules } = await import("@/lib/stylesheet-rules");
const { HomeSiteHeader } = await import("@/components/site-header");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORBIDDEN_TARGETS = [/start-with-ai/, /CONTRIBUTING/, /npmjs\.com/, /\/contact$/];

async function headerLinks(locale: "en" | "de" = "en"): Promise<LinkItemType[]> {
  return (await baseOptions(locale)).links ?? [];
}

function describeItem(item: LinkItemType): string {
  const url = "url" in item ? item.url : "";
  return `${item.type ?? "main"}:${url}`;
}

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function renderHomeHeader(locale: "en" | "de" = "en"): Promise<HTMLDivElement> {
  const links = await headerLinks(locale);
  homeLayout.current = {
    slots: {},
    navItems: links.filter((item) => item.on !== "menu"),
    menuItems: links.filter((item) => item.on !== "nav"),
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<HomeSiteHeader />));
  mounted = { container, root };
  return container;
}

function hrefs(scope: Element | null | undefined, selector: string): Array<string | null> {
  return Array.from(scope?.querySelectorAll(selector) ?? [], (link) => link.getAttribute("href"));
}

afterEach(() => {
  location.pathname = "/";
  if (!mounted) return;
  act(() => mounted?.root.unmount());
  mounted.container.remove();
  mounted = undefined;
});

describe("the landing header version pill", () => {
  it("names the released cli version and links its GitHub release in a new tab", async () => {
    const pill = (await renderHomeHeader()).querySelector<HTMLAnchorElement>(
      "header a.vk-version-pill",
    );
    expect(pill?.textContent).toBe(`v${PACKAGE_VERSION}`);
    expect(pill?.getAttribute("href")).toBe(releaseUrl(PACKAGE_VERSION));
    expect(pill?.getAttribute("target")).toBe("_blank");
    expect(pill?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(pill?.getAttribute("aria-label")).toBe("cta.label");
  });

  it("counts a click as an outbound link from the header", async () => {
    const pill = (await renderHomeHeader()).querySelector("a.vk-version-pill");
    expect(pill?.getAttribute("data-umami-event")).toBe("outbound-link");
    expect(pill?.getAttribute("data-umami-event-target")).toBe("version");
    expect(pill?.getAttribute("data-umami-event-location")).toBe("header");
  });

  it("sits right after the wordmark, in the title group", async () => {
    const pill = (await renderHomeHeader()).querySelector("a.vk-version-pill");
    expect(pill?.parentElement?.classList.contains("flex-1")).toBe(true);
    expect(pill?.parentElement?.lastElementChild).toBe(pill);
  });

  it("shows on the landing in every locale and nowhere else", async () => {
    location.pathname = "/de";
    expect((await renderHomeHeader("de")).querySelector(".vk-version-pill")).not.toBeNull();
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = undefined;
    location.pathname = "/de/contact";
    expect((await renderHomeHeader("de")).querySelector(".vk-version-pill")).toBeNull();
  });

  it("links the tag the release workflow creates for the cli", () => {
    expect(releaseUrl("0.11.1")).toBe(
      "https://github.com/verbatra/verbatra/releases/tag/%40verbatra%2Fcli%400.11.1",
    );
  });

  it("shows only from 768px", () => {
    const rules = docsStylesheetRules().filter((rule) => rule.selector === ".vk-version-pill");
    expect(rules.map((rule) => [rule.media, rule.declarations.display])).toEqual([
      ["", "none"],
      ["@media (width >= 768px)", "inline-flex"],
    ]);
  });
});

describe("primary navigation", () => {
  it("holds Docs, Reference and the GitHub icon, nothing else", async () => {
    expect((await headerLinks()).map(describeItem)).toEqual([
      "main:/docs",
      "main:/docs/cli",
      "icon:https://github.com/verbatra/verbatra",
    ]);
  });

  it("links neither the AI setup guide, the contributor guide, npm nor the contact page", async () => {
    for (const item of await headerLinks()) {
      const url = "url" in item ? (item.url ?? "") : "";
      for (const target of FORBIDDEN_TARGETS) expect(url).not.toMatch(target);
    }
  });

  it("renders the same items in the header bar and in the phone drawer", async () => {
    const container = await renderHomeHeader();
    const header = container.querySelector("header");
    const drawer = container.querySelector("[data-drawer]");

    expect(hrefs(header, "nav a")).toEqual(["/docs", "/docs/cli"]);
    expect(hrefs(header, "a[aria-label]:not(.vk-version-pill)")).toEqual([
      "https://github.com/verbatra/verbatra",
    ]);
    expect(
      Array.from(drawer?.querySelectorAll("a:not([aria-label])") ?? [], (a) => a.textContent),
    ).toEqual(["nav.docs", "nav.reference"]);
    expect(hrefs(drawer, "a[aria-label]")).toEqual(["https://github.com/verbatra/verbatra"]);
    for (const href of hrefs(container, "a")) {
      for (const target of FORBIDDEN_TARGETS) expect(href ?? "").not.toMatch(target);
    }
  });

  it("prefixes the header and drawer links with a non-default locale", async () => {
    const container = await renderHomeHeader("de");
    const drawer = container.querySelector("[data-drawer]");

    expect(hrefs(container.querySelector("header"), "nav a")).toEqual(["/de/docs", "/de/docs/cli"]);
    expect(hrefs(drawer, "a:not([aria-label])")).toEqual(["/de/docs", "/de/docs/cli"]);
  });

  it("keeps the version pill out of the primary nav and the drawer", async () => {
    const container = await renderHomeHeader();
    const pill = container.querySelector(".vk-version-pill");
    expect(pill).not.toBeNull();
    expect(pill?.closest("nav")).toBeNull();
    expect(container.querySelector("[data-drawer] .vk-version-pill")).toBeNull();
  });

  it("marks the drawer item of the current page as active and current", async () => {
    location.pathname = "/docs";
    const drawer = (await renderHomeHeader()).querySelector("[data-drawer]");
    const docs = drawer?.querySelector('a[href="/docs"]');
    const reference = drawer?.querySelector('a[href="/docs/cli"]');

    expect(docs?.getAttribute("data-active")).toBe("true");
    expect(docs?.getAttribute("aria-current")).toBe("page");
    expect(reference?.getAttribute("data-active")).toBe("false");
    expect(reference?.hasAttribute("aria-current")).toBe(false);
  });
});
