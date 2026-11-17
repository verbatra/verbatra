// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_OPT_OUT_ACTION,
  AnalyticsOptOut,
  type AnalyticsOptOutLabels,
} from "./analytics-opt-out";

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
      forms.map(() => ["post", ANALYTICS_OPT_OUT_ACTION]),
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

  it("runs no client code", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "analytics-opt-out.tsx"),
      "utf8",
    );
    expect(source).not.toContain('"use client"');
    expect(source).not.toMatch(/localStorage|document\.cookie/);
  });
});
