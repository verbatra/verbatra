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
  optOut: "Opt out",
  optIn: "Opt in",
  statusOptedOut: "Opted out",
  statusOptedIn: "Opted in",
  signals: "GPC and DNT are honored",
};

function render(locale: "en" | "de" = "en"): Document {
  const markup = renderToStaticMarkup(<AnalyticsOptOut locale={locale} labels={LABELS} />);
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("AnalyticsOptOut", () => {
  it("renders two plain forms that post the choice and the locale without JavaScript", () => {
    const doc = render("de");
    const forms = Array.from(doc.querySelectorAll("form"));

    expect(forms.map((form) => [form.getAttribute("method"), form.getAttribute("action")])).toEqual(
      [
        ["post", ANALYTICS_OPT_OUT_ACTION],
        ["post", ANALYTICS_OPT_OUT_ACTION],
      ],
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
      { lang: "de", choice: "off" },
      { lang: "de", choice: "on" },
    ]);
    expect(forms.map((form) => form.querySelector('button[type="submit"]')?.textContent)).toEqual([
      "Opt out",
      "Opt in",
    ]);
  });

  it("keeps each confirmation hidden until the redirect's fragment targets it", () => {
    const doc = render();

    for (const [id, text] of [
      ["analytics-off", "Opted out"],
      ["analytics-on", "Opted in"],
    ] as const) {
      const status = doc.getElementById(id);
      expect(status?.textContent).toBe(text);
      expect(status?.getAttribute("role")).toBe("status");
      expect(status?.className.split(" ")).toEqual(
        expect.arrayContaining(["hidden", "target:block"]),
      );
    }
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
