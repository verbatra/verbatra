// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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

  it("shows the first ten of many locales with two links each and a button for the rest", () => {
    const locales = Array.from({ length: 40 }, (_, index) => `xx-${index}`);
    const view = render(
      <LocalesSection status={dataView(locales.map((tag) => row(tag)))} lock={NO_LOCK} />,
    );

    expect(coverageRows(view)).toHaveLength(10);
    expect(view.all("tbody a")).toHaveLength(20);
    expect(view.getByText("button", "Show all 40 locales")).not.toBeNull();
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
    expect(view.all("thead th").map((cell) => cell.textContent)).toContain("Open");
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

  it("draws row links as quiet table text, underlined only on hover and focus", () => {
    const view = render(<LocalesSection status={dataView([row("de")])} lock={NO_LOCK} />);
    const tokens = (view.get("tbody a").className ?? "").split(" ");

    expect(tokens).not.toContain("underline");
    expect(tokens).toContain("hover:underline");
    expect(tokens).toContain("focus-visible:underline");
    expect(tokens).toContain("text-foreground");
    expect(tokens.filter((name) => name.includes("(--") && name.startsWith("text-"))).toEqual([]);
  });

  it("gives each locale exactly two row links, in one group", () => {
    const view = render(
      <LocalesSection status={dataView([row("de"), row("fr")])} lock={NO_LOCK} />,
    );

    expect(view.all("[data-row-links]")).toHaveLength(2);
    for (const group of view.all("[data-row-links]")) {
      expect(group.querySelectorAll("[data-row-link]")).toHaveLength(2);
    }
  });

  it("pins the locale column in place while the rest of the table scrolls sideways", () => {
    const view = render(<LocalesSection status={dataView([row("de")])} lock={NO_LOCK} />);
    const head = view.get("thead th");
    const cell = view.get("tbody td");

    for (const node of [head, cell]) {
      expect(node.className).toContain("sticky");
      expect(node.className).toContain("start-0");
    }
    expect(cell.className).toContain("bg-card");
  });

  it("puts the scroll hint above the table", () => {
    const view = render(<LocalesSection status={dataView([row("de")])} lock={NO_LOCK} />);
    const hint = view.getByText("p", "Scroll sideways to see every column.");
    const region = view.get('[aria-label="Locale coverage"]');

    expect(hint.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("makes the coverage region a tab stop only when it really overflows", () => {
    const calm = render(<LocalesSection status={dataView([row("de")])} lock={NO_LOCK} />);

    expect(calm.get('[aria-label="Locale coverage"]').hasAttribute("tabindex")).toBe(false);
    expect(calm.get('[aria-label="Locale coverage"]').getAttribute("role")).toBe("region");

    vi.spyOn(Element.prototype, "scrollWidth", "get").mockReturnValue(600);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(300);
    try {
      const wide = render(<LocalesSection status={dataView([row("fr")])} lock={NO_LOCK} />);

      expect(wide.get('[aria-label="Locale coverage"]').getAttribute("tabindex")).toBe("0");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("holds the lock file locales in a labelled card with its own scroll hint", () => {
    const view = render(
      <LocalesSection
        status={dataView([row("de")])}
        lock={{
          kind: "loaded",
          version: 2,
          locales: [{ locale: "de", keyCount: 4, missing: 0, stale: 0, upToDate: 4 }],
        }}
      />,
    );
    const region = view.get('[aria-label="Lock file locales"]');

    expect(region.getAttribute("role")).toBe("region");
    expect(region.querySelectorAll("thead th")).toHaveLength(6);
    expect(
      view.all("p").filter((node) => node.textContent === "Scroll sideways to see every column."),
    ).toHaveLength(2);
  });

  it("replaces a failed status alert with a short pointer when the page already shows that error", () => {
    const error = { code: "LOCK_FILE_INVALID", message: "bad" };

    const hidden = render(
      <LocalesSection
        status={{ kind: "error", error }}
        lock={NO_LOCK}
        hideCode="LOCK_FILE_INVALID"
      />,
    );
    const shown = render(
      <LocalesSection status={{ kind: "error", error }} lock={NO_LOCK} hideCode="INTERNAL" />,
    );

    expect(hidden.query('[role="alert"]')).toBeNull();
    expect(hidden.text()).toContain("Locale coverage is unavailable. See the error above.");
    expect(shown.get('[role="alert"]')).not.toBeNull();
  });

  it("shows a stale lock notice unless the page already shows that error", () => {
    const loaded: LockView = {
      kind: "loaded",
      version: 1,
      locales: [],
      staleError: { code: "INTERNAL", message: "x" },
    };

    const shown = render(<LocalesSection status={dataView([row("de")])} lock={loaded} />);
    const hidden = render(
      <LocalesSection status={dataView([row("de")])} lock={loaded} hideCode="INTERNAL" />,
    );

    expect(shown.get('[role="alert"]').textContent).toContain("Showing the last known lock file.");
    expect(hidden.query('[role="alert"]')).toBeNull();
  });

  it("sorts the worst covered locale first", () => {
    const view = render(
      <LocalesSection
        status={dataView([row("de"), row("fr", { missing: 8, upToDate: 2 })])}
        lock={NO_LOCK}
      />,
    );

    expect(view.all("[data-locale-tag]").map((node) => node.textContent)).toEqual(["fr", "de"]);
  });

  it("makes the lock file locales region a tab stop only when it really overflows", () => {
    const lock: LockView = {
      kind: "loaded",
      version: 2,
      locales: [{ locale: "de", keyCount: 4, missing: 0, stale: 0, upToDate: 4 }],
    };
    const calm = render(<LocalesSection status={dataView([row("de")])} lock={lock} />);

    expect(calm.get('[aria-label="Lock file locales"]').hasAttribute("tabindex")).toBe(false);

    vi.spyOn(Element.prototype, "scrollWidth", "get").mockReturnValue(600);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(300);
    try {
      const wide = render(<LocalesSection status={dataView([row("fr")])} lock={lock} />);

      expect(wide.get('[aria-label="Lock file locales"]').getAttribute("tabindex")).toBe("0");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
