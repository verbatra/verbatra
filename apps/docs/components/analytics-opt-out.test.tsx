// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ANALYTICS_ROUTE } from "@/lib/analytics-choice";
import { CHOICE_EVENT } from "@/lib/analytics-client";
import { clearDocumentCookie, setDocumentCookie } from "../test-support/document-cookie";
import { AnalyticsOptOut, type AnalyticsOptOutLabels } from "./analytics-opt-out";

const LABELS: AnalyticsOptOutLabels = {
  optIn: "Allow extended analytics",
  defaultOnly: "Count page views only",
  optOut: "Opt out",
  statusOptedIn: "Extended analytics allowed",
  statusDefault: "Page views only",
  statusOptedOut: "Opted out",
  signals: "GPC and DNT are honored",
};

function render(locale: "en" | "de" = "en"): Document {
  const markup = renderToStaticMarkup(<AnalyticsOptOut locale={locale} labels={LABELS} />);
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("AnalyticsOptOut", () => {
  it("renders three plain forms that post the choice and the locale without JavaScript", () => {
    const doc = render("de");
    const forms = Array.from(doc.querySelectorAll("form"));

    expect(forms.map((form) => [form.getAttribute("method"), form.getAttribute("action")])).toEqual(
      forms.map(() => ["post", ANALYTICS_ROUTE]),
    );
    expect(
      forms.map((form) =>
        Object.fromEntries(
          Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]'), (input) => [
            input.name,
            input.value,
          ]),
        ),
      ),
    ).toEqual([
      { lang: "de", choice: "full" },
      { lang: "de", choice: "default" },
      { lang: "de", choice: "off" },
    ]);
    expect(forms.map((form) => form.querySelector('button[type="submit"]')?.textContent)).toEqual([
      "Allow extended analytics",
      "Count page views only",
      "Opt out",
    ]);
  });

  it("keeps each confirmation hidden until the redirect's fragment targets it", () => {
    const doc = render();

    for (const [id, text] of [
      ["analytics-full", "Extended analytics allowed"],
      ["analytics-default", "Page views only"],
      ["analytics-off", "Opted out"],
    ] as const) {
      const status = doc.getElementById(id);
      expect(status?.textContent).toBe(text);
      expect(status?.getAttribute("role")).toBe("status");
      expect(status?.className.split(" ")).toEqual(
        expect.arrayContaining(["hidden", "target:block"]),
      );
    }
  });

  it("lets a long label wrap inside its button instead of widening the page", () => {
    const classes = render().querySelector("form button")?.className.split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["whitespace-normal", "max-w-full", "h-auto"]));
  });

  it("blocks the panel from session replay", () => {
    expect(render().querySelector(".rr-block")).not.toBeNull();
  });

  it("states that browser privacy signals are honored", () => {
    expect(render().body.textContent).toContain("GPC and DNT are honored");
  });

  it("marks no button as pressed in the server markup, because the server cannot read the choice", () => {
    expect(render().querySelectorAll("[aria-pressed]")).toHaveLength(0);
  });

  it("reads the choice from the cookie accessor only and never from storage", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "analytics-opt-out.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
});

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function mount(): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AnalyticsOptOut locale="en" labels={LABELS} />);
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  clearDocumentCookie("verbatra_analytics");
});

describe("AnalyticsOptOut with a stored choice", () => {
  it.each([
    ["full", "Allow extended analytics", "Extended analytics allowed"],
    ["default", "Count page views only", "Page views only"],
    ["off", "Opt out", "Opted out"],
  ])("marks the %s button as pressed and shows one status line", async (value, pressed, status) => {
    setDocumentCookie("verbatra_analytics", value);
    const container = await mount();

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(
      1,
    );
    expect(
      buttons.find((button) => button.getAttribute("aria-pressed") === "true")?.textContent,
    ).toBe(pressed);
    expect(
      buttons.filter((button) => button.getAttribute("aria-pressed") === "false"),
    ).toHaveLength(2);
    const lines = container.querySelectorAll("[role='status']");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.id).toBe(`analytics-${value}`);
    expect(lines[0]?.textContent).toBe(status);
    expect(lines[0]?.className.split(" ")).not.toContain("hidden");
  });

  it("marks nothing as pressed while no choice is stored", async () => {
    const container = await mount();
    expect(container.querySelectorAll("[aria-pressed]")).toHaveLength(0);
    expect(container.querySelectorAll("[role='status']")).toHaveLength(3);
  });

  it("follows a choice made elsewhere on the page", async () => {
    const container = await mount();
    setDocumentCookie("verbatra_analytics", "off");
    await act(async () => {
      window.dispatchEvent(new Event(CHOICE_EVENT));
    });
    expect(container.querySelector("button[aria-pressed='true']")?.textContent).toBe("Opt out");
  });
});
