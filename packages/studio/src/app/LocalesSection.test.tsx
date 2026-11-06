// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { type StatusData, type StatusRow, toStatusData } from "../client/coverage.js";
import type { RefreshableView } from "../client/state.js";
import { LocalesSection } from "./LocalesSection.js";
import { render } from "./test-support.js";
import type { LockView } from "./use-lock-state.js";

const NO_LOCK: LockView = { kind: "no-lock" };

function row(locale: string, counts: Partial<StatusRow> = {}): StatusRow {
  const missing = counts.missing ?? 0;
  const stale = counts.stale ?? 0;
  const upToDate = counts.upToDate ?? 10;
  const [data] = toStatusData({
    inSync: missing === 0 && stale === 0,
    locales: [{ locale, missing, stale, upToDate, inSync: missing === 0 && stale === 0 }],
  }).rows;
  if (data === undefined) {
    throw new Error("no row was built");
  }
  return data;
}

function dataView(rows: readonly StatusRow[], stale = false): RefreshableView<StatusData> {
  const data: StatusData = { inSync: rows.every((entry) => entry.inSync), rows };
  return stale
    ? { kind: "data", data, stale: true, error: { code: "RATE_LIMITED", message: "slow down" } }
    : { kind: "data", data, stale: false };
}

function coverageRows(view: ReturnType<typeof render>): HTMLElement[] {
  return view.all('[aria-label="Locale coverage"] tbody tr');
}

describe("LocalesSection", () => {
  it("links every locale row to its translations and its review queue", () => {
    const view = render(
      <LocalesSection status={dataView([row("de"), row("fr")])} lock={NO_LOCK} />,
    );

    expect(view.all("tbody a").map((link) => link.getAttribute("href"))).toEqual([
      "#/translations?locale=de",
      "#/review?locale=de",
      "#/translations?locale=fr",
      "#/review?locale=fr",
    ]);
  });

  it("names each link by its visible word plus the locale, so every link is unique", () => {
    const view = render(
      <LocalesSection status={dataView([row("de"), row("fr")])} lock={NO_LOCK} />,
    );
    const names = view.all("tbody a").map((link) => link.textContent);

    expect(names).toEqual([
      "Translations for de",
      "Review for de",
      "Translations for fr",
      "Review for fr",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("encodes a long, region-qualified locale tag in the link address", () => {
    const tag = "zh-Hant-TW-u-ca-chinese-x-private-use-long";
    const view = render(<LocalesSection status={dataView([row(tag)])} lock={NO_LOCK} />);

    expect(view.get("tbody a").getAttribute("href")).toBe(`#/translations?locale=${tag}`);
  });

  it("keeps locale tags left to right, Arabic included, in both tables", () => {
    const lock: LockView = {
      kind: "loaded",
      version: 3,
      locales: [
        {
          locale: "ar",
          keyCount: 4,
          missing: 0,
          stale: 0,
          upToDate: 4,
        },
      ],
    };
    const view = render(<LocalesSection status={dataView([row("ar")])} lock={lock} />);

    const tagCells = view.all("[data-locale-tag], td[data-mono]");

    expect(tagCells).toHaveLength(2);
    for (const cell of tagCells) {
      expect(cell.textContent).toBe("ar");
      expect(cell.getAttribute("dir")).toBe("ltr");
    }
  });

  it("renders one row and four links per locale for a project with many locales", () => {
    const locales = Array.from({ length: 40 }, (_, index) => `xx-${index}`);
    const view = render(
      <LocalesSection status={dataView(locales.map((tag) => row(tag)))} lock={NO_LOCK} />,
    );

    expect(coverageRows(view)).toHaveLength(40);
    expect(view.all("tbody a")).toHaveLength(80);
  });

  it("sets percentages and key counts in tabular sans numerals, never mono", () => {
    const view = render(
      <LocalesSection status={dataView([row("de", { missing: 2, upToDate: 8 })])} lock={NO_LOCK} />,
    );
    const figures = view.all("[data-figure]");

    expect(figures).toHaveLength(1);
    expect(figures[0]?.textContent).toBe("80%8 / 10 keys");
    expect(figures[0]?.className).toContain("tabular-nums");
    expect(figures[0]?.className).not.toContain("font-mono");
  });

  it("uses scale widths and no pixel-valued arbitrary class", () => {
    const view = render(<LocalesSection status={dataView([row("de")])} lock={NO_LOCK} />);
    const classes = view.all("tbody *").flatMap((node) => node.className.toString().split(" "));

    expect(classes.filter((name) => name.includes("px]"))).toEqual([]);
    expect(classes).toContain("min-w-40");
    expect(classes).toContain("max-w-60");
  });

  it("carries no native title anywhere in the section", () => {
    const view = render(<LocalesSection status={dataView([row("de")])} lock={NO_LOCK} />);

    expect(view.query("[title]")).toBeNull();
  });

  it("keeps the Up to date column header the screenshot script waits for", () => {
    const view = render(<LocalesSection status={dataView([row("de")])} lock={NO_LOCK} />);

    expect(view.getByText("th", "Up to date")).not.toBeNull();
    expect(view.all("thead th").map((cell) => cell.textContent)).not.toContain("Open");
  });

  it("shows the loading state while the status read is open", () => {
    const view = render(<LocalesSection status={{ kind: "loading" }} lock={NO_LOCK} />);

    expect(view.get('[role="status"]').textContent).toContain("Loading locale coverage");
    expect(view.query("table")).toBeNull();
  });

  it("shows a failed status read as an alert and no table", () => {
    const view = render(
      <LocalesSection
        status={{ kind: "error", error: { code: "INTERNAL", message: "boom" } }}
        lock={NO_LOCK}
      />,
    );

    expect(view.get('[role="alert"]')).not.toBeNull();
    expect(view.query("table")).toBeNull();
  });

  it("keeps the rows and says the status is the last known one when a refresh failed", () => {
    const view = render(<LocalesSection status={dataView([row("de")], true)} lock={NO_LOCK} />);

    expect(view.get('[role="alert"]').textContent).toContain("Showing the last known status.");
    expect(coverageRows(view)).toHaveLength(1);
  });

  it("explains a missing lock file and shows no Lock column", () => {
    const view = render(<LocalesSection status={dataView([row("de")])} lock={NO_LOCK} />);

    expect(view.text()).toContain("No lock file yet.");
    expect(view.query("th:not([data-numeric])")).not.toBeNull();
    expect(view.all("thead th").map((cell) => cell.textContent)).not.toContain("Lock");
  });

  it("shows an unreadable lock file as an alert beside the coverage rows", () => {
    const view = render(
      <LocalesSection
        status={dataView([row("de")])}
        lock={{ kind: "error", error: { code: "INTERNAL", message: "bad json" } }}
      />,
    );

    expect(view.get('[role="alert"]')).not.toBeNull();
    expect(coverageRows(view)).toHaveLength(1);
  });

  it("shows the lock version in the section header and a Lock column once the lock loads", () => {
    const view = render(
      <LocalesSection
        status={dataView([row("de")])}
        lock={{ kind: "loaded", version: 7, locales: [] }}
      />,
    );

    expect(view.text()).toContain("Lock v7");
    expect(view.all("thead th").map((cell) => cell.textContent)).toContain("Lock");
  });
});
