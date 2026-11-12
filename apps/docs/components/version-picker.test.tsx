// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASE_LINES, VERSION_STORAGE_KEY } from "@/lib/docs-version";
import en from "@/messages/en.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: keyof typeof en.docs.versionPicker) => en.docs.versionPicker[key],
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { VersionPicker } = await import("./version-picker");

let mounted: Root | undefined;

beforeEach(() => {
  for (const name of ["data-vk-cli", "data-vk-studio", "data-vk-mcp"]) {
    document.documentElement.removeAttribute(name);
  }
  localStorage.clear();
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = undefined;
  document.body.innerHTML = "";
});

function mount(layout: "header" | "sidebar" = "header"): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  act(() => {
    mounted = createRoot(container);
    mounted.render(<VersionPicker layout={layout} />);
  });
  return container;
}

function selects(container: HTMLElement): HTMLSelectElement[] {
  return Array.from(container.querySelectorAll("select"));
}

describe("VersionPicker markup", () => {
  it("renders on Latest on the server, with Latest first and the lines newest first", () => {
    const markup = renderToStaticMarkup(<VersionPicker layout="header" />);
    const doc = new DOMParser().parseFromString(markup, "text/html");
    const [cli, studio, mcp] = Array.from(doc.querySelectorAll("select"));
    expect(cli?.value).toBe("latest");
    expect(Array.from(cli?.options ?? [], (option) => option.value)).toEqual([
      "latest",
      ...RELEASE_LINES.cli.lines,
    ]);
    expect(Array.from(studio?.options ?? [], (option) => option.value)).toEqual([
      "latest",
      ...RELEASE_LINES.studio.lines,
    ]);
    expect(Array.from(mcp?.options ?? [], (option) => option.value)[1]).toBe(
      RELEASE_LINES.mcp.lines[0],
    );
  });

  it("gives every select a visible label, and keeps Studio and MCP behind a disclosure", () => {
    const container = mount();
    for (const select of selects(container)) {
      const label = container.querySelector(`label[for="${select.id}"]`);
      expect(label?.textContent?.length, select.id).toBeGreaterThan(0);
    }
    const [cli] = selects(container);
    expect(cli?.closest("details")).toBeNull();
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    expect(selects(container).filter((select) => details?.contains(select))).toHaveLength(2);
    expect(details?.querySelector("summary")?.textContent).toBe(en.docs.versionPicker.more);
  });

  it("uses native selects only, so the keyboard needs no custom widget", () => {
    const container = mount();
    expect(container.querySelectorAll("[role='listbox'], [role='combobox']")).toHaveLength(0);
  });
});

describe("VersionPicker behaviour", () => {
  it("sets the line on the html element, stores it and shows it as chosen", () => {
    const container = mount();
    const [cli] = selects(container);
    act(() => {
      if (!cli) throw new Error("no select");
      cli.value = "0.12";
      cli.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.documentElement.getAttribute("data-vk-cli")).toBe("0.12");
    expect(JSON.parse(localStorage.getItem(VERSION_STORAGE_KEY) ?? "{}")).toEqual({ cli: "0.12" });
    expect(selects(container)[0]?.value).toBe("0.12");
  });

  it("shows the choice the init script already put on the page after it mounts", () => {
    document.documentElement.setAttribute("data-vk-studio", "0.5");
    const container = mount();
    expect(selects(container)[1]?.value).toBe("0.5");
  });

  it("closes the disclosure on Escape and returns focus to its toggle", () => {
    const container = mount();
    const details = container.querySelector("details");
    const summary = container.querySelector("summary");
    if (!details || !summary) throw new Error("no disclosure");
    act(() => {
      details.open = true;
    });
    act(() => {
      details.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it("marks the layout it renders in, so the stylesheet can place it", () => {
    expect(mount("sidebar").querySelector(".vk-version-picker")?.getAttribute("data-layout")).toBe(
      "sidebar",
    );
  });
});
