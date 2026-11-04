// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../../client/diff-view.js";
import { MAX_RENDERED_KEYS } from "../../client/filter.js";
import { buildReviewReportMarkdown } from "../../client/review-report.js";
import type { RenderResult, StubRpcHandler, StubRpcResult } from "../test-support.js";
import {
  clickAsync,
  flush,
  pressKey,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  selectOption,
  stubRpc,
  typeInto,
} from "../test-support.js";
import { TranslationsPanel } from "./TranslationsPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const MACHINE = { origin: "machine", reviewState: "unreviewed" } as const;

const writeText = vi.fn<(text: string) => Promise<void>>();
Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

afterEach(() => {
  window.history.replaceState(null, "", "#/translations");
});

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
});

interface KeyLists {
  readonly missing?: readonly string[];
  readonly changed?: readonly string[];
  readonly orphaned?: readonly string[];
  readonly protected?: readonly string[];
}

function localeDiff(locale: string, lists: KeyLists = {}): DiffLocale {
  const missing = lists.missing ?? [];
  const changed = lists.changed ?? [];
  const orphaned = lists.orphaned ?? [];
  return {
    locale,
    missing,
    changed,
    orphaned,
    hasPendingChanges: missing.length > 0 || changed.length > 0,
    ...(lists.protected !== undefined ? { protected: lists.protected } : {}),
  };
}

function diffResult(locales: readonly DiffLocale[]): StubRpcResult {
  return {
    ok: true,
    result: { hasPendingChanges: locales.some((locale) => locale.hasPendingChanges), locales },
  };
}

const PENDING: StubRpcHandler = () => new Promise<StubRpcResult>(() => {});

const DEFAULT_LOCALES: readonly DiffLocale[] = [
  localeDiff("de", { missing: ["app.title"], changed: ["app.body"] }),
  localeDiff("fr", { missing: ["app.title"] }),
];

const DEFAULT_VALUES = ["de", "fr"].map((locale) => ({
  locale,
  values: { "app.title": { source: "Welcome" }, "app.body": { source: "Body" } },
}));

const IN_SYNC_LOCALES: readonly DiffLocale[] = [localeDiff("de"), localeDiff("fr")];

type Stubs = Readonly<Record<string, StubRpcResult | StubRpcHandler>>;

const GRID_COVERAGE: StubRpcResult = {
  ok: true,
  result: {
    inSync: false,
    locales: [
      { locale: "de", missing: 1, stale: 1, upToDate: 8, inSync: false },
      { locale: "fr", missing: 1, stale: 0, upToDate: 9, inSync: false },
    ],
  },
};

function stubPage(overrides: Stubs = {}): void {
  stubRpc({
    "status.diff": diffResult(DEFAULT_LOCALES),
    "status.check": GRID_COVERAGE,
    "locale.values": { ok: true, result: DEFAULT_VALUES },
    "review.queue": { ok: true, result: { available: true, locales: [] } },
    "locale.integrity": { ok: true, result: { locales: [] } },
    ...overrides,
  });
}

function stubSyncedPage(overrides: Stubs = {}): void {
  stubPage({
    "status.diff": diffResult(IN_SYNC_LOCALES),
    ...overrides,
  });
}

function drawerStubs(): Stubs {
  return {
    "project.snapshot": { ok: true, result: { capabilities: { spend: false, writeToDisk: true } } },
    "key.integrity": { ok: true, result: { locales: [] } },
    "key.value": { ok: true, result: { source: "Hello", target: "Hallo" } },
    "key.context": {
      ok: true,
      result: { source: "Hello", target: "Hallo", glossary: { terms: [], doNotTranslate: [] } },
    },
    "history.list": { ok: true, result: { available: false } },
  };
}

function answersInOrder(results: readonly [StubRpcResult, ...StubRpcResult[]]): StubRpcHandler {
  let index = 0;
  return () => {
    const answer = results[Math.min(index, results.length - 1)] ?? results[0];
    index += 1;
    return answer;
  };
}

function deferredAnswers(): {
  readonly handler: StubRpcHandler;
  answer(call: number, result: StubRpcResult): void;
} {
  const resolvers: Array<(result: StubRpcResult) => void> = [];
  return {
    handler: () =>
      new Promise<StubRpcResult>((resolve) => {
        resolvers.push(resolve);
      }),
    answer(call: number, result: StubRpcResult): void {
      const resolve = resolvers[call];
      if (resolve === undefined) {
        throw new Error(`call ${call} was never made`);
      }
      resolve(result);
    },
  };
}

function keyDownOn(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function sectionTitles(view: RenderResult): string[] {
  return view.all("section h2").map((heading) => heading.textContent ?? "");
}

function rowKeys(view: RenderResult): string[] {
  return view.all("tbody tr").map((row) => row.dataset.key ?? "");
}

function cellButton(view: RenderResult, key: string, locale: string): HTMLButtonElement {
  const found = view
    .all("tbody button")
    .find((button) => button.getAttribute("aria-label")?.startsWith(`${key} in ${locale}: `));
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`no cell for ${key} in ${locale}`);
  }
  return found;
}

function cellText(view: RenderResult, key: string, locale: string): string {
  return (cellButton(view, key, locale).getAttribute("aria-label") ?? "").replace(
    `${key} in ${locale}: `,
    "",
  );
}

function chooseLocale(view: RenderResult, locale: string): void {
  selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, locale);
}

function alertTexts(view: RenderResult): string[] {
  return view.all('[role="alert"]').map((alert) => alert.textContent ?? "");
}

function filterInput(view: RenderResult): HTMLInputElement {
  const input = view.get('input[type="search"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("the key filter is not an input element");
  }
  return input;
}

async function openKeyDrawer(view: RenderResult, key: string, locale: string): Promise<void> {
  await clickAsync(cellButton(view, key, locale));
  await flush();
}

describe("TranslationsPanel", () => {
  it("names the page in its header", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get("h1").textContent).toBe("Translations");
  });

  it("shows a loading indicator while the pending-change read is still open", () => {
    stubPage({ "status.diff": PENDING });

    const view = render(<TranslationsPanel refreshToken={1} />);

    expect(view.all('[role="status"]').map((element) => element.textContent)).toContain(
      "Loading...",
    );
  });

  it("withholds the review-report action until the diff has loaded", () => {
    stubPage({ "status.diff": PENDING });

    const view = render(<TranslationsPanel refreshToken={1} />);

    expect(view.query("header button")).toBeNull();
  });

  it("offers the review-report action once the diff has loaded", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.getByText("header button", "Copy as review report")).toBeTruthy();
  });

  it("never reads lock state or usage, which live on the overview", async () => {
    stubPage();

    await renderAsync(<TranslationsPanel refreshToken={1} />);

    const methods = rpcCalls.map((call) => call.method);
    expect(methods).not.toContain("lock.state");
    expect(methods).not.toContain("usage.summary");
  });

  it("reads the whole project's diff, with no locale filter", async () => {
    stubPage();

    await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(rpcCalls).toContainEqual({ method: "status.diff", params: {} });
  });

  it("re-reads the diff on every refresh token change", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(rpcCalls.filter((call) => call.method === "status.diff")).toHaveLength(2);
  });

  it("renders the hard error state when the very first diff read fails", async () => {
    stubPage({ "status.diff": rpcError("SOURCE_INVALID", "unparseable") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "The source locale file could not be read or parsed for the configured format.",
    ]);
  });

  it("hides the key explorer while the diff is in the hard error state", async () => {
    stubPage({ "status.diff": rpcError("SOURCE_INVALID", "unparseable") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(sectionTitles(view)).not.toContain("Keys");
  });

  it("keeps the last good pending changes on screen when a re-read fails", async () => {
    stubPage({
      "status.diff": answersInOrder([diffResult(DEFAULT_LOCALES), rpcError("INTERNAL", "gone")]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toEqual([
      "Showing the last known pending changes. An unexpected server error occurred. Check the terminal running Studio for details.",
    ]);
    expect(sectionTitles(view)).toContain("Keys");
  });

  it("ignores a diff response that a later refresh already superseded", async () => {
    const diff = deferredAnswers();
    stubPage({ "status.diff": diff.handler });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    view.rerender(<TranslationsPanel refreshToken={2} />);

    diff.answer(1, diffResult([localeDiff("de", { missing: ["fresh.key"] })]));
    await flush();
    diff.answer(0, diffResult([localeDiff("de", { missing: ["superseded.key"] })]));
    await flush();

    expect(view.text()).toContain("fresh.key");
    expect(view.text()).not.toContain("superseded.key");
  });
});

describe("TranslationsPanel all-clear state", () => {
  it("banners an empty project as fully in sync", async () => {
    stubPage({ "status.diff": diffResult([]) });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get('[role="status"]').textContent).toContain("Everything is in sync");
  });

  it("keeps the table and its filters when nothing is pending, so a search can still find any key", async () => {
    stubSyncedPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(sectionTitles(view)).toContain("Keys");
    expect(view.query('input[type="search"]')).not.toBeNull();
    expect(view.text()).toContain("No keys need attention");
    expect(view.query("tbody tr")).toBeNull();
  });

  it("finds a key that is in sync when it is searched for", async () => {
    pointHashAt("#/translations?q=welcome");
    stubSyncedPage({
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.title": { source: "Welcome", target: "Willkommen" },
              "app.body": { source: "Body", target: "Inhalt" },
            },
          },
          { locale: "fr", values: { "app.title": { source: "Welcome", target: "Bienvenue" } } },
        ],
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(rowKeys(view)).toEqual(["app.title"]);
    expect(cellText(view, "app.title", "de")).toBe("In sync");
    expect(cellText(view, "app.title", "fr")).toBe("In sync");
  });

  it("lists a broken translation of an otherwise clean project, with the integrity filter", async () => {
    stubSyncedPage({
      "review.queue": { ok: true, result: { available: false, reason: "provenance-unreadable" } },
      "locale.integrity": {
        ok: true,
        result: { locales: [{ locale: "de", entries: [integrityEntry("app.body", false)] }] },
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get('[role="status"]').textContent).toContain("integrity problems");
    expect(statusToggle(view, "integrity").textContent).toBe("Integrity problems1");
    expect(rowKeys(view)).toEqual(["app.body"]);
    expect(cellText(view, "app.body", "de")).toBe("In sync, integrity problem");
  });

  it("lists a protected key of an otherwise clean project", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { protected: ["app.terms"] }), localeDiff("fr")]),
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(rowKeys(view)).toEqual(["app.terms"]);
    expect(cellText(view, "app.terms", "de")).toBe("Protected");
  });

  it("says nothing needs attention when nothing is pending and every translation passes", async () => {
    stubSyncedPage({
      "locale.integrity": { ok: true, result: { locales: [{ locale: "de", entries: [] }] } },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get('[role="status"]').textContent).not.toContain("integrity problems");
    expect(view.text()).toContain("No keys need attention");
  });

  it("still lists a locale whose only drift is orphaned", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { orphaned: ["app.legacy"] })]),
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(rowKeys(view)).toEqual(["app.legacy"]);
    expect(view.query('[role="status"]')).toBeNull();
  });
});

describe("TranslationsPanel loading and value errors", () => {
  it("shows the heading and the filters at once, with a skeleton only where the table goes", async () => {
    stubPage({ "status.diff": PENDING });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(sectionTitles(view)).toContain("Keys");
    expect(filterInput(view)).not.toBeNull();
    expect(view.all("[data-status-filter]")).toHaveLength(6);
    expect(
      view
        .all("[data-status-filter]")
        .every((chip) => chip.getAttribute("aria-disabled") === "true"),
    ).toBe(true);
    expect(view.query("table")).toBeNull();
    expect(view.get('[role="status"]').textContent).toBe("Loading...");
    expect(view.all("[data-bar]").length).toBeGreaterThan(0);
    expect(view.get("[data-key-count]").textContent).toBe("");
  });

  it("keeps the same search field, still focused, when the diff arrives", async () => {
    const diff = deferredAnswers();
    stubPage({ "status.diff": diff.handler });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    const field = filterInput(view);
    act(() => field.focus());
    typeInto(field, "ti");

    diff.answer(0, diffResult(DEFAULT_LOCALES));
    await flush();

    expect(filterInput(view)).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("ti");
    expect(rowKeys(view)).toEqual(["app.title"]);
  });

  it("keeps the locale and the open key of a deep link when a chosen chip is clicked during loading", async () => {
    pointHashAt("#/translations?locale=de&status=missing&key=x");
    stubPage({ "status.diff": PENDING, "locale.values": PENDING });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(statusToggle(view, "missing").getAttribute("aria-pressed")).toBe("true");
    expect((view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement).value).toBe(
      "de",
    );
    await clickAsync(statusToggle(view, "missing"));

    expect(window.location.hash).toBe("#/translations?locale=de&key=x");
  });

  it("keeps a typed search in the address with the rest of a deep link during loading", async () => {
    pointHashAt("#/translations?locale=de&key=x");
    stubPage({ "status.diff": PENDING, "locale.values": PENDING });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    typeInto(filterInput(view), "cart");

    expect(window.location.hash).toBe("#/translations?locale=de&key=x&q=cart");
  });

  it("lets the locale choice be reset while the diff loads", async () => {
    pointHashAt("#/translations?status=changed");
    stubPage({ "status.diff": PENDING });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    chooseLocale(view, "");

    expect(window.location.hash).toBe("#/translations?status=changed");
  });

  it("still opens the key of a deep link when the translation values could not be read", async () => {
    pointHashAt("#/translations?key=app.title");
    stubPage({ ...drawerStubs(), "locale.values": rpcError("INTERNAL", "gone") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("does not claim nothing needs attention while a status source is unavailable", async () => {
    stubSyncedPage({ "review.queue": rpcError("QUEUE_UNREADABLE") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get("[data-key-count]").textContent).toBe("0 keys need attention so far");
    expect(view.text()).toContain("No keys found so far");
    expect(view.text()).not.toContain("No keys need attention");
  });

  it("says it is still checking, not that a read failed, while a source loads", async () => {
    stubSyncedPage({ "review.queue": PENDING });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.text()).toContain("Still checking");
    expect(view.text()).toContain("are still loading");
    expect(view.text()).not.toContain("could not be read");
  });

  it("says a read failed, not that it is loading, when a source errors", async () => {
    stubSyncedPage({ "locale.integrity": rpcError("LOCK_FILE_INVALID") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.text()).toContain("No keys found so far");
    expect(view.text()).toContain("could not be read");
    expect(view.text()).not.toContain("still loading");
  });

  it("marks a capped total as partial while a source is unavailable", async () => {
    const keys = Array.from({ length: MAX_RENDERED_KEYS + 1 }, (_, index) => `app.key${index}`);
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: keys })]),
      "review.queue": rpcError("QUEUE_UNREADABLE"),
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get("[data-key-cap]").textContent).toBe(
      `Showing ${MAX_RENDERED_KEYS} of ${keys.length} keys so far. Refine the filter to see more.`,
    );
  }, 15000);

  it("marks a filtered count as partial too", async () => {
    stubPage({ "review.queue": rpcError("QUEUE_UNREADABLE") });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    typeInto(filterInput(view), "body");

    expect(view.get("[data-key-count]").textContent).toBe("1 matching key so far");
  });

  it("says so for a source that is still loading, and keeps the diff rows", async () => {
    stubPage({ "review.queue": PENDING });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get("[data-key-count]").textContent).toBe("2 keys need attention so far");
    expect(rowKeys(view)).toEqual(["app.body", "app.title"]);
  });

  it("keeps the count region in the page, with the empty wording, when nothing needs attention", async () => {
    stubSyncedPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get("[data-key-count]").getAttribute("aria-live")).toBe("polite");
    expect(view.get("[data-key-count]").textContent).toBe("0 keys need attention");
  });

  it("says search can only match key names when the translation values cannot be read", async () => {
    stubPage({ "locale.values": rpcError("INTERNAL", "gone") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "Source and translation text could not be read, so search only matches key names. An unexpected server error occurred. Check the terminal running Studio for details.",
    ]);
    expect(rowKeys(view)).toEqual(["app.body", "app.title"]);
  });

  it("shows no such notice when the values loaded", async () => {
    stubPage({ "locale.values": KEY_VALUES_STUB() });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([]);
  });
});

describe("TranslationsPanel review report", () => {
  it("copies the full loaded diff, not the on-screen view, to the clipboard", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await clickAsync(view.getByText("header button", "Copy as review report"));

    expect(writeText).toHaveBeenCalledWith(buildReviewReportMarkdown(DEFAULT_LOCALES));
  });

  it("confirms a copy and reverts the label after the confirmation window", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      stubPage();
      const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
      const button = view.getByText("header button", "Copy as review report");

      await clickAsync(button);
      expect(button.textContent).toBe("Copied");

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(button.textContent).toBe("Copy as review report");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never confirms when the clipboard write is refused", async () => {
    stubPage();
    writeText.mockRejectedValueOnce(new Error("clipboard permission denied"));
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    const button = view.getByText("header button", "Copy as review report");

    await clickAsync(button);

    expect(button.textContent).toBe("Copy as review report");
  });
});

describe("TranslationsPanel key table", () => {
  it("is one table with a key filter and no view switch, in every state", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.all("table")).toHaveLength(1);
    expect(view.get('input[type="search"]').getAttribute("aria-label")).toBe(
      "Filter by key or translation text",
    );
    expect(view.query('[role="radiogroup"], [aria-label="Keys view"]')).toBeNull();
    expect(
      view.all("button").some((button) => ["Grid", "List"].includes(button.textContent ?? "")),
    ).toBe(false);
  });

  it("rows each key that needs attention once, with one status cell per locale", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(rowKeys(view)).toEqual(["app.body", "app.title"]);
    expect(
      view
        .all("thead th")
        .map((header) => header.querySelector(".font-mono")?.textContent ?? header.textContent),
    ).toEqual(["Key", "Source", "de", "fr"]);
    expect(cellText(view, "app.title", "de")).toBe("Missing");
    expect(cellText(view, "app.body", "de")).toBe("Changed");
    expect(cellText(view, "app.body", "fr")).toBe("In sync");
  });

  it("shows the source text beside each key", async () => {
    stubPage({
      "locale.values": {
        ok: true,
        result: [
          { locale: "de", values: { "app.title": { source: "Welcome" } } },
          { locale: "fr", values: { "app.title": { source: "Welcome" } } },
        ],
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get('[data-key="app.title"] [data-source]').textContent).toBe("Welcome");
  });

  it("lists the keys a run would leave for a person as Protected", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", { changed: ["app.cta", "app.terms"], protected: ["app.terms"] }),
      ]),
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(statusToggle(view, "protected").textContent).toBe("Protected1");
    expect(cellText(view, "app.terms", "de")).toBe("Protected");
    expect(cellText(view, "app.cta", "de")).toBe("Changed");
  });

  it("switches to one row per key with the source, translation, status and origin when a locale is chosen", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { changed: ["app.title", "app.body"] })]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.title": {
                source: "Welcome",
                target: "Willkommen",
                provenance: { origin: "human", reviewState: "unreviewed" },
              },
              "app.body": { source: "Body", target: "Text" },
            },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    chooseLocale(view, "de");
    await flush();

    expect(view.all("thead th").map((header) => header.textContent)).toEqual([
      "Key",
      "Source",
      "Translation",
      "Status",
      "Origin",
    ]);
    const row = view.get('[data-key="app.title"]');
    expect(row.querySelector("[data-source]")?.textContent).toBe("Welcome");
    expect(row.querySelector("[data-translation]")?.textContent).toBe("Willkommen");
    expect(row.textContent).toContain("Changed");
    expect(row.textContent).toContain("Origin: Human");
    expect(view.get('[data-key="app.body"]').textContent).not.toContain("Origin");
  });

  it("gives no origin to a missing or orphaned entry, matching the lock file's counts", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", { missing: ["app.new"], orphaned: ["app.old"] }),
      ]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.new": { source: "New" },
              "app.old": {
                target: "Veraltet",
                provenance: { origin: "unrecorded", reviewState: "unreviewed" },
              },
            },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    chooseLocale(view, "de");
    await flush();

    expect(view.get('[data-key="app.new"]').textContent).toContain("No translation");
    expect(view.get('[data-key="app.old"]').textContent).not.toContain("Origin");
    expect(view.get('[data-key="app.new"]').textContent).not.toContain("Origin");
  });

  it("narrows to the keys whose name, source or translation matches the search", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title", "app.body"] })]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.title": { source: "Welcome" },
              "app.body": { source: "Please review your shipping address" },
            },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    typeInto(filterInput(view), "shipping");
    expect(rowKeys(view)).toEqual(["app.body"]);

    typeInto(filterInput(view), "title");
    expect(rowKeys(view)).toEqual(["app.title"]);

    typeInto(filterInput(view), "nothing matches this");
    expect(rowKeys(view)).toEqual([]);
  });

  it("keeps the 500 cap correct when a value match, not a key match, pushes the total over it", async () => {
    const decoyKeys = Array.from({ length: MAX_RENDERED_KEYS }, (_, index) => `app.key${index}`);
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: [...decoyKeys, "app.needle"] })]),
      "locale.values": {
        ok: true,
        result: [
          { locale: "de", values: { "app.needle": { source: "a very specific needle string" } } },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    typeInto(filterInput(view), "needle");

    expect(rowKeys(view)).toEqual(["app.needle"]);
    expect(view.text()).not.toContain("refine the filter to see more");
  }, 15000);

  it("caps a long table and says how many keys it is hiding", async () => {
    const keys = Array.from({ length: MAX_RENDERED_KEYS + 1 }, (_, index) => `app.key${index}`);
    stubPage({
      "status.diff": answersInOrder([
        diffResult([localeDiff("de", { missing: ["app.title"] })]),
        diffResult([localeDiff("de", { missing: keys })]),
      ]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(rowKeys(view)).toHaveLength(MAX_RENDERED_KEYS);
    const note = `Showing ${MAX_RENDERED_KEYS} of ${keys.length} keys. Refine the filter to see more.`;
    expect(view.get("[data-key-count]").textContent).toBe(note);
    expect(view.get("[data-key-cap]").textContent).toBe(note);
    expect(view.get("[data-key-cap]").previousElementSibling?.tagName).toBe("P");
  }, 15000);

  it("counts the rows in words, for the keys that need attention and for a search", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get("[data-key-count]").textContent).toBe("2 keys need attention");

    typeInto(filterInput(view), "body");
    expect(view.get("[data-key-count]").textContent).toBe("1 matching key");
  });

  it("says the same thing about the same default filter in both tables", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["a", "b"] })]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    const matrix = view.get("[data-key-count]").textContent;

    chooseLocale(view, "de");
    await flush();

    expect(matrix).toBe("2 keys need attention");
    expect(view.get("[data-key-count]").textContent).toBe(matrix);
  });

  it("names the key filter differently from the header search", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(filterInput(view).placeholder).toBe("Filter keys…");
  });

  it("marks only the row whose key is open as selected", async () => {
    pointHashAt("#/translations?key=app.title");
    stubPage({ ...drawerStubs(), "locale.values": KEY_VALUES_STUB() });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(
      view.all("tbody tr").map((row) => [row.dataset.key, row.getAttribute("aria-selected")]),
    ).toEqual([
      ["app.body", "false"],
      ["app.title", "true"],
    ]);
  });

  it("names a cell with its key, locale and status, then each marker after a comma", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(cellButton(view, "app.title", "de").getAttribute("aria-label")).toBe(
      "app.title in de: Missing",
    );
    expect(cellButton(view, "app.body", "de").getAttribute("aria-label")).toBe(
      "app.body in de: Changed, integrity problem",
    );
    expect(cellButton(view, "app.subtitle", "fr").getAttribute("aria-label")).toBe(
      "app.subtitle in fr: In sync, in the review queue",
    );
  });

  it("explains a marker in a tooltip with the same words", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.all("[role='tooltip']").map((tip) => tip.textContent)).toEqual([
      "Integrity problem",
      "In the review queue",
    ]);
  });

  it("keeps the page chrome in the page direction and sets each value in its own direction", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("ar-EG", { changed: ["app.title"] }),
        localeDiff("de", { changed: ["app.title"] }),
      ]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "ar-EG",
            values: { "app.title": { source: "Welcome {name}", target: "مرحبا {name}" } },
          },
          { locale: "de", values: { "app.title": { source: "Welcome {name}" } } },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get("table").hasAttribute("dir")).toBe(false);
    expect(view.all("thead [dir], tbody th[dir]")).toEqual([]);

    chooseLocale(view, "ar-EG");
    await flush();

    const translation = view.get("[data-translation]");
    expect(translation.getAttribute("dir")).toBe("rtl");
    expect(translation.getAttribute("lang")).toBe("ar-EG");
    expect(translation.querySelector('bdi[dir="ltr"]')?.textContent).toBe("{name}");
    expect(view.get("[data-source]").getAttribute("dir")).toBe("auto");
  });
});

describe("TranslationsPanel keyboard", () => {
  function stops(view: RenderResult): HTMLElement[] {
    return view.all("tbody [data-row]");
  }

  it("puts exactly the first cell in the Tab order", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(stops(view).map((stop) => stop.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it("moves between cells with the arrow keys, stopping at the row edges and wrapping rows", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    const first = cellButton(view, "app.body", "de");
    act(() => first.focus());

    keyDownOn(first, "ArrowRight");
    expect(document.activeElement).toBe(cellButton(view, "app.body", "fr"));
    expect(cellButton(view, "app.body", "fr").tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);

    keyDownOn(document.activeElement as HTMLElement, "ArrowRight");
    expect(document.activeElement).toBe(cellButton(view, "app.body", "fr"));

    keyDownOn(document.activeElement as HTMLElement, "ArrowLeft");
    keyDownOn(document.activeElement as HTMLElement, "ArrowLeft");
    expect(document.activeElement).toBe(first);

    keyDownOn(first, "ArrowDown");
    expect(document.activeElement).toBe(cellButton(view, "app.title", "de"));

    keyDownOn(document.activeElement as HTMLElement, "ArrowUp");
    expect(document.activeElement).toBe(first);

    keyDownOn(first, "ArrowUp");
    expect(document.activeElement).toBe(cellButton(view, "app.title", "de"));

    keyDownOn(document.activeElement as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(first);
  });

  it("moves one row at a time in the entries table", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    chooseLocale(view, "de");
    await flush();
    const [top, next] = stops(view);

    act(() => top?.focus());
    keyDownOn(top as HTMLElement, "ArrowDown");

    expect(document.activeElement).toBe(next);
    keyDownOn(next as HTMLElement, "ArrowRight");
    expect(document.activeElement).toBe(next);
  });

  it("adopts a cell that receives focus directly as the roving position", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    const target = cellButton(view, "app.title", "fr");

    act(() => target.focus());

    expect(target.tabIndex).toBe(0);
    expect(stops(view).filter((stop) => stop.tabIndex === 0)).toHaveLength(1);
  });

  it("opens the key from Enter and Space, and ignores other keys", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    const cell = cellButton(view, "app.title", "de");

    keyDownOn(cell, "a");
    expect(view.query('[role="dialog"]')).toBeNull();

    keyDownOn(cell, "Enter");
    await flush();
    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");

    await clickAsync(view.get('button[aria-label="Close details for app.title"]'));
    keyDownOn(cell, " ");
    await flush();
    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("keeps one cell in the Tab order after the table shrinks under the stored position", async () => {
    stubPage({
      "status.diff": answersInOrder([
        diffResult([localeDiff("de", { missing: ["a", "b", "c"] })]),
        diffResult([localeDiff("de", { missing: ["a"] })]),
      ]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    act(() => cellButton(view, "c", "de").focus());

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(stops(view).map((stop) => stop.tabIndex)).toEqual([0]);
  });
});

describe("TranslationsPanel key overlays", () => {
  it("opens the key drawer for the key whose cell was activated", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await openKeyDrawer(view, "app.title", "de");

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("opens the key drawer from a row of the entries table too", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    chooseLocale(view, "de");
    await flush();

    await clickAsync(view.get('[data-key="app.body"] button'));
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.body");
  });

  it("opens the key drawer when any part of the row is clicked", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await clickAsync(view.get('[data-key="app.body"] th'));
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.body");
  });

  it("closes the key drawer again", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");

    await clickAsync(view.get('button[aria-label="Close details for app.title"]'));

    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("swaps the drawer for the entry editor rather than stacking both", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");

    await clickAsync(view.getByText("button", "Edit"));
    await flush();

    expect(view.all('[role="dialog"]').map((dialog) => dialog.getAttribute("aria-label"))).toEqual([
      "Edit app.title in de",
    ]);
  });

  it("returns to the drawer when the editor is closed", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");
    await clickAsync(view.getByText("button", "Edit"));
    await flush();

    await clickAsync(view.get('button[aria-label="Close the editor for app.title"]'));
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("puts focus back on the Edit button of the edited locale after Escape from the editor", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");
    await clickAsync(view.getByText("button", "Edit"));
    await flush();

    pressKey("Escape");
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
    expect(document.activeElement).toBe(view.getByText("button", "Edit"));
  });

  it("returns to the drawer after an accepted edit", async () => {
    stubPage({
      ...drawerStubs(),
      "translation.editEntry": { ok: true, result: { accepted: true, value: "Hallo" } },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");
    await clickAsync(view.getByText("button", "Edit"));
    await flush();

    await clickAsync(view.getByText("button", "Save"));
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });
});

function integrityEntry(key: string, matches: boolean) {
  return {
    key,
    hasPlaceholders: true,
    matches,
    missing: matches ? [] : ["{name}"],
    extra: [],
    icuValid: true,
    icuArmsMatch: true,
    icuArmDetails: [],
    markupMatches: true,
    markupDetails: [],
  };
}

const FILTER_LOCALES: readonly DiffLocale[] = [
  localeDiff("de", {
    missing: ["app.title"],
    changed: ["app.body", "app.cta"],
    protected: ["app.cta"],
  }),
  localeDiff("fr", { missing: ["app.title"], orphaned: ["app.legacy"] }),
];

function stubFilterPage(overrides: Stubs = {}): void {
  stubPage({
    "status.diff": diffResult(FILTER_LOCALES),
    "review.queue": {
      ok: true,
      result: {
        available: true,
        locales: [
          {
            locale: "fr",
            needsReview: [{ key: "app.subtitle", reasons: ["EQUALS_SOURCE"], provenance: MACHINE }],
          },
        ],
      },
    },
    "locale.integrity": {
      ok: true,
      result: {
        locales: [
          {
            locale: "de",
            entries: [integrityEntry("app.body", false), integrityEntry("app.cta", true)],
          },
          { locale: "fr", entries: [] },
        ],
      },
    },
    ...overrides,
  });
}

function statusToggle(view: RenderResult, status: string): HTMLButtonElement {
  return view.get(`[data-status-filter="${status}"]`) as HTMLButtonElement;
}

describe("TranslationsPanel key filters", () => {
  it("counts the keys in every status across the locales, the review queue and integrity included", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.all("[data-status-filter]").map((toggle) => toggle.textContent)).toEqual([
      "Missing1",
      "Changed2",
      "Orphaned1",
      "Protected1",
      "Review queue1",
      "Integrity problems1",
    ]);
  });

  it("reads the review queue and the integrity report as soon as the diff is shown", async () => {
    stubFilterPage();
    await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(rpcCalls.filter((call) => call.method === "locale.integrity")).toEqual([
      { method: "locale.integrity", params: {} },
    ]);
    expect(rpcCalls.some((call) => call.method === "review.queue")).toBe(true);
  });

  it("rows the review queue and the integrity problems alongside the drift, with markers", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(rowKeys(view)).toEqual([
      "app.body",
      "app.cta",
      "app.legacy",
      "app.subtitle",
      "app.title",
    ]);
    expect(cellText(view, "app.body", "de")).toBe("Changed, integrity problem");
    expect(cellText(view, "app.subtitle", "fr")).toBe("In sync, in the review queue");
    expect(
      view.get('[data-key="app.subtitle"] [data-marker="review"]').getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("narrows the rows to the chosen status in the all-locales table", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    await clickAsync(statusToggle(view, "integrity"));

    expect(statusToggle(view, "integrity").getAttribute("aria-pressed")).toBe("true");
    expect(rowKeys(view)).toEqual(["app.body"]);
    expect(view.all("thead th")).toHaveLength(4);
  });

  it("combines several statuses", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    await clickAsync(statusToggle(view, "orphaned"));
    await clickAsync(statusToggle(view, "review"));

    expect(rowKeys(view)).toEqual(["app.legacy", "app.subtitle"]);
  });

  it("narrows to one locale, counting only that locale", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    chooseLocale(view, "fr");
    await flush();

    expect(rowKeys(view)).toEqual(["app.legacy", "app.subtitle", "app.title"]);
    expect(statusToggle(view, "missing").textContent).toBe("Missing1");
    expect(statusToggle(view, "integrity").textContent).toBe("Integrity problems0");
  });

  it("applies the text filter inside the chosen statuses", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    await clickAsync(statusToggle(view, "changed"));
    typeInto(filterInput(view), "cta");

    expect(rowKeys(view)).toEqual(["app.cta"]);
  });

  it("explains an empty result and clears the locale and statuses on request", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();
    chooseLocale(view, "fr");
    await clickAsync(statusToggle(view, "integrity"));

    expect(view.text()).toContain("No locale has a key in the chosen states.");
    await clickAsync(view.getByText("button", "Clear filters"));

    expect(rowKeys(view)).toHaveLength(5);
    expect(statusToggle(view, "integrity").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the empty state for a search without hits, and clearing filters focuses the search", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    typeInto(filterInput(view), "no-such-text");

    expect(rowKeys(view)).toEqual([]);
    expect(view.text()).toContain("No matching keys");
    expect(view.text()).toContain("matches the search");
    expect(view.all("[data-status-filter]").map((toggle) => toggle.textContent)).toEqual([
      "Missing0",
      "Changed0",
      "Orphaned0",
      "Protected0",
      "Review queue0",
      "Integrity problems0",
    ]);

    await clickAsync(view.getByText("button", "Clear filters"));

    expect(filterInput(view).value).toBe("");
    expect(document.activeElement).toBe(filterInput(view));
    expect(rowKeys(view)).toHaveLength(5);
  });

  it("counts only the keys the search matches on each status chip", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    typeInto(filterInput(view), "cta");

    expect(statusToggle(view, "changed").textContent).toBe("Changed1");
    expect(statusToggle(view, "missing").textContent).toBe("Missing0");
  });

  it("marks the review and integrity statuses unavailable, with the reason, while their reads fail", async () => {
    stubFilterPage({
      "review.queue": rpcError("QUEUE_UNREADABLE"),
      "locale.integrity": rpcError("LOCK_FILE_INVALID"),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    const review = statusToggle(view, "review");
    expect(review.getAttribute("aria-disabled")).toBe("true");
    expect(statusToggle(view, "integrity").getAttribute("aria-disabled")).toBe("true");
    expect(statusToggle(view, "missing").hasAttribute("aria-disabled")).toBe(false);
    expect(review.getAttribute("aria-describedby")).toBe(view.all("[role='tooltip']")[0]?.id);
    expect(view.all("[role='tooltip']").map((tip) => tip.textContent)).toEqual([
      "Not available right now",
      "Not available right now",
    ]);

    await clickAsync(review);
    expect(review.getAttribute("aria-pressed")).toBe("false");
  });

  it("says a status is still loading, not broken, while its read is open", async () => {
    stubFilterPage({ "review.queue": PENDING });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get("[role='tooltip']").textContent).toBe("Still loading");
  });

  it("opens the key drawer from an integrity problem", async () => {
    stubFilterPage({ "key.integrity": { ok: true, result: { locales: [] } } });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();
    await clickAsync(statusToggle(view, "integrity"));

    await clickAsync(cellButton(view, "app.body", "de"));
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.body");
  });

  it("finds a key that needs no attention when it is searched for, in either table", async () => {
    stubFilterPage({
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.title": { source: "Welcome", target: "Willkommen" },
              "app.footer": { source: "Imprint", target: "Impressum" },
            },
          },
          { locale: "fr", values: { "app.footer": { source: "Imprint", target: "Mentions" } } },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();
    expect(rowKeys(view)).not.toContain("app.footer");

    typeInto(filterInput(view), "impressum");
    expect(rowKeys(view)).toEqual(["app.footer"]);
    expect(cellText(view, "app.footer", "de")).toBe("In sync");

    chooseLocale(view, "fr");
    await flush();
    expect(rowKeys(view)).toEqual([]);

    typeInto(filterInput(view), "mentions");
    expect(rowKeys(view)).toEqual(["app.footer"]);
    expect(view.get('[data-key="app.footer"]').textContent).toContain("In sync");
  });
});

function pointHashAt(hash: string): void {
  window.history.replaceState(null, "", hash);
}

function KEY_VALUES_STUB(): StubRpcResult {
  return {
    ok: true,
    result: [
      {
        locale: "de",
        values: {
          "app.title": { source: "Welcome", target: "Willkommen" },
          "app.body": { source: "Body", target: "Inhalt" },
        },
      },
    ],
  };
}

describe("TranslationsPanel deep links", () => {
  it("opens the table filtered to the locale and status of the hash", async () => {
    pointHashAt("#/translations?locale=de&status=missing");
    stubFilterPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect((view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement).value).toBe(
      "de",
    );
    expect(statusToggle(view, "missing").getAttribute("aria-pressed")).toBe("true");
    expect(statusToggle(view, "changed").getAttribute("aria-pressed")).toBe("false");
    expect(rowKeys(view)).toEqual(["app.title"]);
  });

  it("opens the drawer for the key of the hash", async () => {
    pointHashAt("#/translations?locale=de&status=missing&key=app.title");
    stubFilterPage({ ...drawerStubs(), "locale.values": KEY_VALUES_STUB() });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("opens no drawer and reads no key until the locale values have loaded", async () => {
    pointHashAt("#/translations?key=app.title");
    let answerValues: (result: StubRpcResult) => void = () => {};
    stubFilterPage({
      ...drawerStubs(),
      "locale.values": () => new Promise<StubRpcResult>((resolve) => (answerValues = resolve)),
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rpcCalls.filter((call) => call.method === "key.value")).toEqual([]);

    answerValues(KEY_VALUES_STUB());
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("ignores a key no locale holds", async () => {
    pointHashAt("#/translations?key=does.not.exist");
    stubFilterPage({ ...drawerStubs(), "locale.values": KEY_VALUES_STUB() });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("ignores an unknown locale and unknown statuses", async () => {
    pointHashAt("#/translations?locale=xx&status=bogus");
    stubFilterPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect((view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement).value).toBe("");
    expect(view.all("[data-status-filter][aria-pressed='true']")).toEqual([]);
    expect(rowKeys(view)).toHaveLength(5);
  });

  it("writes locale, statuses and key into the hash without adding history entries", async () => {
    pointHashAt("#/translations");
    stubFilterPage({ ...drawerStubs(), "locale.values": KEY_VALUES_STUB() });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();
    const entries = window.history.length;

    chooseLocale(view, "de");
    await clickAsync(statusToggle(view, "changed"));
    await clickAsync(statusToggle(view, "missing"));
    expect(window.location.hash).toBe("#/translations?locale=de&status=missing&status=changed");

    await clickAsync(view.get('[data-key="app.title"] th'));
    await flush();
    expect(window.location.hash).toBe(
      "#/translations?locale=de&status=missing&status=changed&key=app.title",
    );

    await clickAsync(view.get('button[aria-label="Close details for app.title"]'));
    expect(window.location.hash).toBe("#/translations?locale=de&status=missing&status=changed");
    expect(window.history.length).toBe(entries);
  });

  it("writes the key search into the hash and keeps it when a filter changes", async () => {
    pointHashAt("#/translations?q=app");
    stubFilterPage({ ...drawerStubs(), "locale.values": KEY_VALUES_STUB() });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();
    const field = view.get('input[aria-label="Filter by key or translation text"]');

    expect((field as HTMLInputElement).value).toBe("app");
    chooseLocale(view, "de");
    expect(window.location.hash).toBe("#/translations?locale=de&q=app");

    typeInto(field as HTMLInputElement, "");
    expect(window.location.hash).toBe("#/translations?locale=de");
  });

  it("keeps the list and the focused search field when the last search text is cleared", async () => {
    pointHashAt("#/translations?q=app");
    stubFilterPage({ ...drawerStubs(), "locale.values": KEY_VALUES_STUB() });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();
    const field = view.get(
      'input[aria-label="Filter by key or translation text"]',
    ) as HTMLInputElement;
    act(() => {
      field.focus();
    });

    typeInto(field, "");

    expect(window.location.hash).toBe("#/translations");
    expect(view.get('input[aria-label="Filter by key or translation text"]')).toBe(field);
    expect(document.activeElement).toBe(field);
  });

  it("clears the key search together with the filters", async () => {
    pointHashAt("#/translations?locale=fr&q=zzz");
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    await clickAsync(view.getByText("button", "Clear filters"));

    expect(window.location.hash).toBe("#/translations");
  });

  it("clears the filters from the hash with the clear button", async () => {
    pointHashAt("#/translations?locale=fr&status=integrity");
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    await clickAsync(view.getByText("button", "Clear filters"));

    expect(window.location.hash).toBe("#/translations");
    expect(rowKeys(view)).toHaveLength(5);
  });

  it("lands on the filtered table from the overview's needs-attention link", async () => {
    pointHashAt("#/translations?status=missing&status=changed&status=orphaned");
    stubFilterPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(
      view
        .all("[data-status-filter][aria-pressed='true']")
        .map((chip) => chip.dataset.statusFilter),
    ).toEqual(["missing", "changed", "orphaned"]);
    expect(rowKeys(view)).toEqual(["app.body", "app.cta", "app.legacy", "app.title"]);
  });

  it("follows a hash change made outside the panel", async () => {
    pointHashAt("#/translations?locale=de");
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    act(() => {
      pointHashAt("#/translations?locale=fr&status=orphaned");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await flush();

    expect((view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement).value).toBe(
      "fr",
    );
    expect(statusToggle(view, "orphaned").getAttribute("aria-pressed")).toBe("true");
    expect(rowKeys(view)).toEqual(["app.legacy"]);
  });
});
