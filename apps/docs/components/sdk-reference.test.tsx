// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

vi.mock("@/lib/source", () => ({
  source: {
    getPages: () => [
      {
        url: "/de/docs/sdk/run",
        data: {
          title: "Übersetzungen ausführen",
          toc: [
            { title: "Übersetzungen ausführen", url: "#übersetzungen-ausführen", depth: 2 },
            { title: <>translate</>, url: "#translate", depth: 3 },
            {
              title: ["Fortschritts", <span key="e">ereignisse</span>],
              url: "#fortschrittsereignisse",
              depth: 3,
            },
          ],
        },
      },
      {
        url: "/de/docs/sdk/errors",
        data: {
          title: "Fehler",
          toc: [{ title: "Das Fehlermodell", url: "#das-fehlermodell", depth: 2 }],
        },
      },
      { url: "/de/docs/cli", data: { title: "Übersicht", toc: [] } },
    ],
    getPageTree: () => ({
      name: "Docs",
      children: [
        { type: "page", name: "Übersicht", url: "/de/docs/cli" },
        {
          type: "folder",
          name: "SDK",
          index: { type: "page", name: "Übersicht", url: "/de/docs/sdk" },
          children: [
            { type: "page", name: "Übersetzungen ausführen", url: "/de/docs/sdk/run" },
            { type: "page", name: "Fehler", url: "/de/docs/sdk/errors" },
          ],
        },
      ],
    }),
  },
}));

const { SdkAnchorForward, SdkEntryPoints, sdkReferenceComponents, sdkReferencePages } =
  await import("./sdk-reference");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the SDK reference pages", () => {
  it("reads the folder's pages in sidebar order with their headings", () => {
    const pages = sdkReferencePages("de");

    expect(pages.map((page) => page.url)).toEqual(["/de/docs/sdk/run", "/de/docs/sdk/errors"]);
    expect(pages[0]?.headings[0]).toEqual({
      anchor: "übersetzungen-ausführen",
      title: "Übersetzungen ausführen",
      depth: 2,
    });
  });

  it("indexes every page with its entry points as links", () => {
    const html = renderToStaticMarkup(
      <SdkEntryPoints locale="de" pageLabel="Seite" entriesLabel="Einstiegspunkte" />,
    );

    expect(html).toContain("<th>Seite</th><th>Einstiegspunkte</th>");
    expect(html).toContain('href="/de/docs/sdk/run"');
    expect(html).toContain('href="/de/docs/sdk/run#translate"><code>translate</code></a>');
    expect(html).toContain(
      'href="/de/docs/sdk/run#fortschrittsereignisse">Fortschrittsereignisse</a>',
    );
    expect(html).not.toContain("das-fehlermodell");
  });
});

describe("the SDK reference MDX components", () => {
  it("bind the page locale, so the MDX passes only its labels", () => {
    const { SdkEntryPoints: Bound } = sdkReferenceComponents("de");
    const html = Bound
      ? renderToStaticMarkup(<Bound pageLabel="Seite" entriesLabel="Punkte" />)
      : "";

    expect(html).toContain('href="/de/docs/sdk/errors"');
  });
});

describe("the SDK anchor forward", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    replace.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  function mount(): void {
    act(() => root.render(<SdkAnchorForward locale="de" />));
  }

  it("forwards an old localized anchor to the page it moved to", () => {
    window.history.replaceState(null, "", "/de/docs/sdk#%C3%BCbersetzungen-ausf%C3%BChren");
    mount();

    expect(replace).toHaveBeenCalledWith("/de/docs/sdk/run#übersetzungen-ausführen");
  });

  it("forwards on a later hash change too", () => {
    mount();
    expect(replace).not.toHaveBeenCalled();

    window.history.replaceState(null, "", "/de/docs/sdk#das-fehlermodell");
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));

    expect(replace).toHaveBeenCalledWith("/de/docs/sdk/errors#das-fehlermodell");
  });

  it("stays put when the anchor is still on the overview", () => {
    const heading = document.createElement("h2");
    heading.id = "translate";
    document.body.append(heading);
    window.history.replaceState(null, "", "/de/docs/sdk#translate");
    mount();
    heading.remove();

    expect(replace).not.toHaveBeenCalled();
  });
});
