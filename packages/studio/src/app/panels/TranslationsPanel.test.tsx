// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

interface CoverageCounts {
  readonly locale: string;
  readonly missing: number;
  readonly stale: number;
  readonly upToDate: number;
}

function checkResult(rows: readonly CoverageCounts[]): StubRpcResult {
  const locales = rows.map((row) => ({ ...row, inSync: row.missing === 0 && row.stale === 0 }));
  return { ok: true, result: { inSync: locales.every((locale) => locale.inSync), locales } };
}

const NO_LOCK: StubRpcResult = { ok: true, result: { exists: false } };
const NO_USAGE: StubRpcResult = { ok: true, result: { available: false } };

const PENDING: StubRpcHandler = () => new Promise<StubRpcResult>(() => {});

const DEFAULT_LOCALES: readonly DiffLocale[] = [
  localeDiff("de", { missing: ["app.title"], changed: ["app.body"] }),
  localeDiff("fr", { missing: ["app.title"] }),
];

const DEFAULT_ROWS: readonly CoverageCounts[] = [
  { locale: "de", missing: 1, stale: 1, upToDate: 8 },
  { locale: "fr", missing: 1, stale: 0, upToDate: 9 },
];

const IN_SYNC_LOCALES: readonly DiffLocale[] = [localeDiff("de"), localeDiff("fr")];

const IN_SYNC_ROWS: readonly CoverageCounts[] = [
  { locale: "de", missing: 0, stale: 0, upToDate: 10 },
  { locale: "fr", missing: 0, stale: 0, upToDate: 10 },
];

type Stubs = Readonly<Record<string, StubRpcResult | StubRpcHandler>>;

function stubPage(overrides: Stubs = {}): void {
  stubRpc({
    "status.diff": diffResult(DEFAULT_LOCALES),
    "status.check": checkResult(DEFAULT_ROWS),
    "lock.state": NO_LOCK,
    "usage.summary": NO_USAGE,
    ...overrides,
  });
}

function stubSyncedPage(overrides: Stubs = {}): void {
  stubPage({
    "status.diff": diffResult(IN_SYNC_LOCALES),
    "status.check": checkResult(IN_SYNC_ROWS),
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

function sectionTitles(view: RenderResult): string[] {
  return view.all("h2").map((heading) => heading.textContent ?? "");
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

async function switchToList(view: RenderResult): Promise<void> {
  await clickAsync(view.getByText("button", "List"));
}

async function openKeyDrawer(view: RenderResult, key: string, locale: string): Promise<void> {
  await clickAsync(view.get(`button[aria-label^="${key} in ${locale}"]`));
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

    expect(view.query("header button")?.textContent).toBe("Copy as review report");
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
    stubPage({ "status.diff": diffResult([]), "status.check": checkResult([]) });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get('[role="status"]').textContent).toContain("Everything is in sync");
  });

  it("hides the key explorer when nothing is pending", async () => {
    stubSyncedPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(sectionTitles(view)).not.toContain("Keys");
  });

  it("keeps the integrity filter reachable when nothing is pending but a translation is broken", async () => {
    stubSyncedPage({
      "review.queue": { ok: true, result: { available: false, reason: "provenance-unreadable" } },
      "locale.integrity": {
        ok: true,
        result: {
          locales: [
            {
              locale: "de",
              entries: [integrityEntry("app.body", false)],
            },
          ],
        },
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get('[role="status"]').textContent).toContain("integrity problems");
    expect(sectionTitles(view)).toContain("Keys");
    expect(view.all("button").some((button) => button.textContent === "Grid")).toBe(false);
    expect(statusToggle(view, "integrity").textContent).toBe("Integrity problems1");
    expect(headings(view)).toContain("Integrity problems(1)");
  });

  it("keeps the key explorer hidden when nothing is pending and every translation passes", async () => {
    stubSyncedPage({
      "locale.integrity": { ok: true, result: { locales: [{ locale: "de", entries: [] }] } },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(sectionTitles(view)).not.toContain("Keys");
    expect(view.get('[role="status"]').textContent).not.toContain("integrity problems");
  });

  it("still explores keys for a locale whose only drift is orphaned", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { orphaned: ["app.legacy"] })]),
      "status.check": checkResult([{ locale: "de", missing: 0, stale: 0, upToDate: 10 }]),
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(sectionTitles(view)).toContain("Keys");
    expect(view.query('[role="status"]')).toBeNull();
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

describe("TranslationsPanel key explorer", () => {
  it("defaults to the key-by-locale grid, with no key filter", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.query('input[type="search"]')).toBeNull();
    expect(view.query('button[aria-label="app.title in de: missing"]')).not.toBeNull();
  });

  it("switches to the per-locale lists, which bring a key filter", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.get('input[type="search"]').getAttribute("aria-label")).toBe(
      "Filter by key or translation text",
    );
    expect(view.all("details")).toHaveLength(2);
  });

  it("returns to the grid when the Grid tab is chosen again", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    await clickAsync(view.getByText("button", "Grid"));

    expect(view.all("details")).toHaveLength(0);
  });

  it("lists a locale's missing, changed, and orphaned keys separately", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", {
          missing: ["app.title", "app.body"],
          changed: ["app.cta"],
          orphaned: ["app.legacy"],
        }),
      ]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 1, upToDate: 7 }]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("h4").map((heading) => heading.textContent)).toEqual([
      "Missing(2)",
      "Changed(1)",
      "Orphaned(1)",
    ]);
    expect(view.all("details ul button").map((button) => button.textContent)).toEqual([
      "app.title",
      "app.body",
      "app.cta",
      "app.legacy",
    ]);
  });

  it("lists the keys a run would leave for a person under Protected, with a count", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", { changed: ["app.cta", "app.terms"], protected: ["app.terms"] }),
      ]),
      "status.check": checkResult([{ locale: "de", missing: 0, stale: 2, upToDate: 8 }]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("h4").map((heading) => heading.textContent)).toEqual([
      "Missing(0)",
      "Changed(2)",
      "Orphaned(0)",
      "Protected(1)",
    ]);
    expect(view.get("details summary").textContent).toContain("Protected 1");
  });

  it("narrows every list to the keys matching the filter, leaving out groups without a match", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", {
          missing: ["app.title", "app.body"],
          changed: ["app.cta"],
          orphaned: ["app.legacy"],
        }),
      ]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 1, upToDate: 7 }]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    typeInto(filterInput(view), "cta");

    expect(view.all("h4").map((heading) => heading.textContent)).toEqual(["Changed(1)"]);
    expect(view.all("details ul button").map((button) => button.textContent)).toEqual(["app.cta"]);
    expect(view.get("[data-locale-summary]").textContent).toBe("Changed 1");
  });

  it("matches a query found only in a key's value, not its key name", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title", "app.body"] })]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 0, upToDate: 8 }]),
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
    await switchToList(view);

    typeInto(filterInput(view), "shipping");

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual(["app.body"]);
  });

  it("labels each listed key with the origin of its current value", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { changed: ["app.title", "app.body"] })]),
      "status.check": checkResult([{ locale: "de", missing: 0, stale: 2, upToDate: 8 }]),
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
    await switchToList(view);

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual([
      "app.title Origin: Human. Written by a person.",
      "app.body",
    ]);
  });

  it("labels only changed keys, not orphaned ones, matching the lock file's counts", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { orphaned: ["app.old"] })]),
      "status.check": checkResult([{ locale: "de", missing: 0, stale: 0, upToDate: 10 }]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
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
    await switchToList(view);

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual(["app.old"]);
  });

  it("still matches a query found in the key name when no value matches", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title", "app.body"] })]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 0, upToDate: 8 }]),
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
    await switchToList(view);

    typeInto(filterInput(view), "title");

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual([
      "app.title",
    ]);
  });

  it("produces no false positive for a key whose value and name both miss the query", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title", "app.body"] })]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 0, upToDate: 8 }]),
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
    await switchToList(view);

    typeInto(filterInput(view), "nothing matches this");

    expect(view.all("details ul button")).toHaveLength(0);
  });

  it("keeps the 500 cap correct when a value match, not a key match, pushes the total over it", async () => {
    const decoyKeys = Array.from({ length: MAX_RENDERED_KEYS }, (_, index) => `app.key${index}`);
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: [...decoyKeys, "app.needle"] })]),
      "status.check": checkResult([
        { locale: "de", missing: decoyKeys.length + 1, stale: 0, upToDate: 0 },
      ]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: { "app.needle": { source: "a very specific needle string" } },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    typeInto(filterInput(view), "needle");

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual([
      "app.needle",
    ]);
    expect(view.text()).not.toContain("refine the filter to see more");
  }, 15000);

  it("caps a long list and says how many keys it is hiding", async () => {
    const keys = Array.from({ length: MAX_RENDERED_KEYS + 1 }, (_, index) => `app.key${index}`);
    stubPage({
      "status.diff": answersInOrder([
        diffResult([localeDiff("de", { missing: ["app.title"] })]),
        diffResult([localeDiff("de", { missing: keys })]),
      ]),
      "status.check": checkResult([{ locale: "de", missing: keys.length, stale: 0, upToDate: 0 }]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(view.text()).toContain(
      `Showing ${MAX_RENDERED_KEYS} of ${keys.length}, refine the filter to see more.`,
    );
  }, 15000);

  it("keeps a right-to-left locale's section in the page direction, since it holds only UI text", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("ar-EG", { missing: ["app.title"] }),
        localeDiff("de", { missing: ["app.title"] }),
      ]),
      "status.check": checkResult([
        { locale: "ar-EG", missing: 1, stale: 0, upToDate: 9 },
        { locale: "de", missing: 1, stale: 0, upToDate: 9 },
      ]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("details")).toHaveLength(2);
    expect(view.all("details[dir], details [dir]")).toEqual([]);
  });

  it("summarizes a pending locale's drift on its always-visible row", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", { missing: ["app.title"], changed: ["app.body"] }),
        localeDiff("fr"),
      ]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("summary")[0]?.textContent).toBe(
      "dePending changesMissing 1Changed 1Orphaned 0",
    );
    const pair = view.get("[data-locale-summary] > span");
    expect(pair.firstElementChild?.className).toContain("text-muted-foreground");
    expect(pair.lastElementChild?.className).toContain("tabular-nums");
    expect(view.all("summary")[0]?.textContent).not.toContain("\u00b7");
  });

  it("marks a locale with nothing pending as up to date, with no drift counts", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title"] }), localeDiff("fr")]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("summary")[1]?.textContent).toBe("frUp to date");
  });

  it("expands the locales with pending changes and leaves the rest collapsed", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title"] }), localeDiff("fr")]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("details").map((section) => section.hasAttribute("open"))).toEqual([
      true,
      false,
    ]);
  });
});

describe("TranslationsPanel key overlays", () => {
  it("opens the key drawer for the key whose grid cell was activated", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await openKeyDrawer(view, "app.title", "de");

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("opens the key drawer from the list view too", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    await clickAsync(view.getByText("details ul button", "app.body"));
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

function listedSections(view: RenderResult): string[] {
  return view
    .all("details summary")
    .map((summary) => summary.textContent?.split(/Pending|Up to/)[0] ?? "");
}

function headings(view: RenderResult): string[] {
  return view.all("h4").map((heading) => heading.textContent ?? "");
}

describe("TranslationsPanel key filters", () => {
  it("counts every status across the locales, the review queue and integrity included", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);
    await flush();

    expect(view.all("[data-status-filter]").map((toggle) => toggle.textContent)).toEqual([
      "Missing2",
      "Changed2",
      "Orphaned1",
      "Protected1",
      "Review queue1",
      "Integrity problems1",
    ]);
  });

  it("reads the review queue and the integrity report only once the list is shown", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    expect(rpcCalls.some((call) => call.method === "locale.integrity")).toBe(false);

    await switchToList(view);

    expect(rpcCalls.filter((call) => call.method === "locale.integrity")).toEqual([
      { method: "locale.integrity", params: {} },
    ]);
    expect(rpcCalls.some((call) => call.method === "review.queue")).toBe(true);
  });

  it("lists the review queue and the integrity problems as their own groups", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);
    await flush();

    expect(headings(view)).toEqual([
      "Missing(1)",
      "Changed(2)",
      "Orphaned(0)",
      "Protected(1)",
      "Integrity problems(1)",
      "Missing(1)",
      "Changed(0)",
      "Orphaned(1)",
      "Review queue(1)",
    ]);
  });

  it("narrows the lists to the chosen statuses and hides a locale with none of them", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    await clickAsync(statusToggle(view, "integrity"));

    expect(statusToggle(view, "integrity").getAttribute("aria-pressed")).toBe("true");
    expect(listedSections(view)).toEqual(["de"]);
    expect(headings(view)).toEqual(["Integrity problems(1)"]);
    expect(
      view.all("details ul button").map((button) => button.querySelector("span span")?.textContent),
    ).toEqual(["app.body"]);
  });

  it("combines several statuses", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    await clickAsync(statusToggle(view, "orphaned"));
    await clickAsync(statusToggle(view, "review"));

    expect(listedSections(view)).toEqual(["fr"]);
    expect(headings(view)).toEqual(["Orphaned(1)", "Review queue(1)"]);
    expect(view.get("[data-locale-summary]").textContent).toBe("Orphaned 1Review queue 1");
  });

  it("narrows to one locale, counting only that locale", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, "fr");
    await flush();

    expect(listedSections(view)).toEqual(["fr"]);
    expect(statusToggle(view, "missing").textContent).toBe("Missing1");
    expect(statusToggle(view, "integrity").textContent).toBe("Integrity problems0");
  });

  it("applies the text filter inside the chosen statuses", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    await clickAsync(statusToggle(view, "changed"));
    typeInto(filterInput(view), "cta");

    expect(headings(view)).toEqual(["Changed(1)"]);
  });

  it("explains an empty result and clears the locale and statuses on request", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();
    selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, "fr");
    await clickAsync(statusToggle(view, "integrity"));

    expect(view.text()).toContain("No locale has a key in the chosen states.");
    await clickAsync(view.getByText("button", "Clear filters"));

    expect(listedSections(view)).toEqual(["de", "fr"]);
    expect(statusToggle(view, "integrity").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the empty state for a search without hits, and clearing filters focuses the search", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    typeInto(filterInput(view), "no-such-text");

    expect(listedSections(view)).toEqual([]);
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
    expect(listedSections(view)).toEqual(["de", "fr"]);
  });

  it("counts only the keys the search matches on each status chip", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    typeInto(filterInput(view), "cta");

    expect(statusToggle(view, "changed").textContent).toBe("Changed1");
    expect(statusToggle(view, "missing").textContent).toBe("Missing0");
  });

  it("disables the review and integrity statuses while their reads fail", async () => {
    stubFilterPage({
      "review.queue": rpcError("QUEUE_UNREADABLE"),
      "locale.integrity": rpcError("LOCK_FILE_INVALID"),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    expect(statusToggle(view, "review").disabled).toBe(true);
    expect(statusToggle(view, "integrity").disabled).toBe(true);
    expect(statusToggle(view, "missing").disabled).toBe(false);
  });

  it("opens the key drawer from an integrity problem", async () => {
    stubFilterPage({ "key.integrity": { ok: true, result: { locales: [] } } });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();
    await clickAsync(statusToggle(view, "integrity"));

    await clickAsync(view.get("details ul button"));

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.body");
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
  it("opens the list filtered to the locale and status of the hash", async () => {
    pointHashAt("#/translations?locale=de&status=missing");
    stubFilterPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect((view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement).value).toBe(
      "de",
    );
    expect(statusToggle(view, "missing").getAttribute("aria-pressed")).toBe("true");
    expect(statusToggle(view, "changed").getAttribute("aria-pressed")).toBe("false");
    expect(listedSections(view)).toEqual(["de"]);
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

    expect(view.query("[data-status-filter]")).toBeNull();
    expect(view.getByText("button", "Grid").getAttribute("aria-pressed")).toBe("true");
  });

  it("writes locale, statuses and key into the hash without adding history entries", async () => {
    pointHashAt("#/translations");
    stubFilterPage({ ...drawerStubs(), "locale.values": KEY_VALUES_STUB() });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();
    const entries = window.history.length;

    selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, "de");
    await clickAsync(statusToggle(view, "changed"));
    await clickAsync(statusToggle(view, "missing"));
    expect(window.location.hash).toBe("#/translations?locale=de&status=missing&status=changed");

    await clickAsync(view.getByText("details ul button", "app.title"));
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
    expect(view.getByText("button", "List").getAttribute("aria-pressed")).toBe("true");
    selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, "de");
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
    expect(view.getByText("button", "List").getAttribute("aria-pressed")).toBe("true");
  });

  it("drops the key search from the hash when the grid view is chosen", async () => {
    pointHashAt("#/translations?q=app");
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    await clickAsync(view.getByText("button", "Grid"));

    expect(window.location.hash).toBe("#/translations");
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
    expect(listedSections(view)).toEqual(["de", "fr"]);
  });

  it("drops the filters from the hash when the grid view is chosen", async () => {
    pointHashAt("#/translations?locale=de&status=missing");
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    await clickAsync(view.getByText("button", "Grid"));

    expect(window.location.hash).toBe("#/translations");
    expect(view.query("[data-status-filter]")).toBeNull();
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
  });
});
