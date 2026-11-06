// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_IDS, type PageId } from "../client/routes.js";
import type { RefreshEvent } from "../shared/sse-events.js";
import { App } from "./App.js";
import { PAGE_MAX_CLASS } from "./lib/page-width.js";
import { installRouteGuard, restoreHeldRoute } from "./route-guard.js";
import {
  agentToolsStatusStore,
  answersInOrder,
  buttonNamed,
  clickAsync,
  elementNamed,
  emitRefresh,
  FILE_BACKED_GLOSSARY,
  flush,
  hasMetricCard,
  metricCard,
  metricFigure,
  metricHint,
  type RenderResult,
  renderAsync,
  rpcCalls,
  rpcError,
  sessionStore,
  stubRpc,
  textboxNamed,
  typeInto,
} from "./test-support.js";
import { replaceRoute } from "./use-route.js";

const NARROW_MEDIA = () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
});

vi.stubGlobal("matchMedia", NARROW_MEDIA);

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const MACHINE = { origin: "machine", reviewState: "unreviewed" } as const;

const PAGE_HEADINGS: Readonly<Record<PageId, string>> = {
  overview: "Overview",
  translations: "Translations",
  review: "Review",
  glossary: "Glossary",
  settings: "Settings",
};

const REVIEW_QUEUE = {
  ok: true,
  result: {
    available: true,
    locales: [
      {
        locale: "de",
        needsReview: [
          { key: "app.title", reasons: ["EQUALS_SOURCE"], provenance: MACHINE },
          { key: "app.subtitle", reasons: ["LENGTH_RATIO_OUTLIER"], provenance: MACHINE },
        ],
      },
    ],
  },
} as const;

function stubPanelReads(): void {
  stubRpc({
    "project.snapshot": {
      ok: true,
      result: {
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "openai" },
        configSource: "verbatra.config.json",
        glossary: { source: "none" },
        capabilities: { spend: false, writeToDisk: true },
        exposeAgentTools: false,
      },
    },
    "review.queue": REVIEW_QUEUE,
    "status.check": { ok: true, result: { inSync: true, locales: [] } },
    "status.diff": { ok: true, result: { hasPendingChanges: false, locales: [] } },
    "lock.state": { ok: true, result: { exists: false } },
    "usage.summary": { ok: true, result: { available: false } },
    "history.list": { ok: true, result: { available: false } },
    "glossary.get": {
      ok: true,
      result: {
        indicator: { source: "none" },
        version: null,
        locales: [],
        terms: [],
        doNotTranslate: [],
        redactedTerms: [],
      },
    },
  });
}

function goToHash(hash: string): void {
  window.history.replaceState(null, "", hash);
}

function countCalls(method: string): number {
  return rpcCalls.filter((call) => call.method === method).length;
}

function sourceEvent(added: number, changed: number, removed = 0): RefreshEvent {
  return {
    reason: "source",
    at: "2026-07-18T09:41:12.000Z",
    locale: "en",
    delta: { added, changed, removed },
  };
}

function mount(): Promise<RenderResult> {
  return renderAsync(<App />);
}

function navItem(view: RenderResult, label: string): HTMLElement {
  const match = view
    .all('header nav[aria-label="Studio"] a')
    .find((button) => button.textContent?.startsWith(label) === true);
  if (match === undefined) {
    throw new Error(`no header nav link labeled ${label}`);
  }
  return match;
}

afterEach(() => {
  vi.stubGlobal("matchMedia", NARROW_MEDIA);
});

beforeEach(() => {
  goToHash("/");
  window.localStorage.clear();
  stubPanelReads();
});

describe("App routing", () => {
  it.each(["/", ""])("lands on the overview when the URL carries the hash %j", async (hash) => {
    goToHash(hash);

    const view = await mount();

    expect(view.get("h1").textContent).toBe("Overview");
  });

  for (const page of PAGE_IDS) {
    it(`renders the ${page} panel for its canonical hash`, async () => {
      goToHash(`#/${page}`);

      const view = await mount();

      expect(view.get("h1").textContent).toBe(PAGE_HEADINGS[page]);
    });
  }

  it("gives the header and the page the same width rule, so their edges line up", async () => {
    goToHash("#/overview");

    const view = await mount();

    expect(view.all("[data-page-width]")).toHaveLength(2);
    for (const element of view.all("[data-page-width]")) {
      expect(element.classList.contains(PAGE_MAX_CLASS)).toBe(true);
    }
    expect(view.get("header").contains(view.all("[data-page-width]")[0] ?? null)).toBe(true);
    expect(view.get("main").contains(view.all("[data-page-width]")[1] ?? null)).toBe(true);
  });

  it("accepts the bare hash form an older link may carry", async () => {
    goToHash("#overview");

    const view = await mount();

    expect(view.get("h1").textContent).toBe("Overview");
  });

  it("sends the retired #/activity link to the overview without a new history entry", async () => {
    goToHash("#/activity");
    const entries = window.history.length;

    const view = await mount();

    expect(window.location.hash).toBe("#/overview");
    expect(window.history.length).toBe(entries);
    expect(view.get("h1").textContent).toBe("Overview");
    expect(view.get('header [aria-current="page"]').textContent).toContain("Overview");
  });

  it("lists the pages as header links in workspace-then-project order", async () => {
    const view = await mount();
    const labels = view
      .all('header nav[aria-label="Studio"] a')
      .map((link) => link.textContent?.replace(/\d.*$/, ""));

    expect(labels).toEqual(["Overview", "Translations", "Review", "Glossary", "Settings"]);
  });

  it("restores the filters of a deep link when browser back returns to the page", async () => {
    goToHash("#/review?locale=de");
    const view = await mount();

    await clickAsync(navItem(view, "Settings"));
    expect(view.get("h1").textContent).toBe("Settings");
    act(() => {
      goToHash("#/review?locale=de");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await flush();

    expect(view.get("h1").textContent).toBe("Review");
    expect((view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement).value).toBe(
      "de",
    );
  });

  it("falls back to the overview for a hash no version of the dashboard knows", async () => {
    goToHash("#/nonsense");

    const view = await mount();

    expect(view.get("h1").textContent).toBe("Overview");
  });

  it("follows a hash change made outside the app, such as browser back", async () => {
    const view = await mount();

    act(() => {
      goToHash("#/settings");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await flush();

    expect(view.get("h1").textContent).toBe("Settings");
  });

  it("writes the canonical hash when a nav item is chosen", async () => {
    const view = await mount();

    await clickAsync(navItem(view, "Glossary"));

    expect(window.location.hash).toBe("#/glossary");
  });

  it("swaps the rendered panel when a nav item is chosen", async () => {
    const view = await mount();

    await clickAsync(navItem(view, "Review"));

    expect(view.get("h1").textContent).toBe("Review");
  });

  it("marks the chosen nav item as the current page", async () => {
    const view = await mount();

    await clickAsync(navItem(view, "Review"));

    expect(view.get('header [aria-current="page"]').textContent).toContain("Review");
  });
});

describe("App session expiry", () => {
  it("replaces the whole shell with the terminal notice once the session expires", async () => {
    const view = await mount();

    act(() => {
      sessionStore.markSessionExpired();
    });

    expect(view.query("header")).toBeNull();
    expect(view.getByText("h1", "Session expired")).not.toBeNull();
  });

  it("announces the expiry, since it replaces the page the user was working in", async () => {
    const view = await mount();

    act(() => {
      sessionStore.markSessionExpired();
    });

    expect(view.get('[role="alert"]').textContent).toContain("Session expired");
  });

  it("tells the user the only way out is a fresh URL from the terminal", async () => {
    const view = await mount();

    act(() => {
      sessionStore.markSessionExpired();
    });

    expect(view.text()).toContain(
      "Open the URL the running Verbatra Studio printed in its terminal again, or start Studio again if it has stopped.",
    );
  });

  it("never renders the shell at all when the session was already expired at mount", async () => {
    sessionStore.markSessionExpired();

    const view = await mount();

    expect(view.getByText("h1", "Session expired")).not.toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("App live refresh", () => {
  it("re-reads the panels' data when the server reports a change", async () => {
    await mount();
    const before = countCalls("review.queue");

    emitRefresh(sourceEvent(1, 0));
    await flush();

    expect(countCalls("review.queue")).toBe(before + 1);
  });

  it("re-reads the active panel's own data too, not just the shell's", async () => {
    await mount();
    const before = countCalls("status.diff");

    emitRefresh(sourceEvent(1, 0));
    await flush();

    expect(countCalls("status.diff")).toBe(before + 1);
  });

  it("re-reads on a lock-file event, which reports no key delta of its own", async () => {
    await mount();
    const before = countCalls("review.queue");

    emitRefresh({ reason: "lock", at: "2026-07-18T09:41:12.000Z" });
    await flush();

    expect(countCalls("review.queue")).toBe(before + 1);
  });

  it("shows no toast before any refresh event has arrived", async () => {
    const view = await mount();

    expect(view.query('[aria-label="Dismiss"]')).toBeNull();
  });

  it("shows a toast naming the change and its key counts", async () => {
    const view = await mount();

    emitRefresh(sourceEvent(1, 3));
    await flush();

    expect(view.getByText("span", "Source changed")).not.toBeNull();
    expect(view.getByText("span", "1 added, 3 changed")).not.toBeNull();
  });

  it("shows no toast for a lock-file event, which has nothing to report", async () => {
    const view = await mount();

    emitRefresh({ reason: "lock", at: "2026-07-18T09:41:12.000Z" });
    await flush();

    expect(view.query('[aria-label="Dismiss"]')).toBeNull();
  });

  it("shows no toast for a save that changed no keys on balance", async () => {
    const view = await mount();

    emitRefresh(sourceEvent(0, 0));
    await flush();

    expect(view.query('[aria-label="Dismiss"]')).toBeNull();
  });

  it("replaces the toast with the newest event rather than stacking them", async () => {
    const view = await mount();

    emitRefresh(sourceEvent(1, 0));
    await flush();
    emitRefresh({
      reason: "targets",
      at: "2026-07-18T09:42:00.000Z",
      locale: "de",
      delta: { added: 0, changed: 0, removed: 2 },
    });
    await flush();

    expect(view.all('[aria-label="Dismiss"]')).toHaveLength(1);
    expect(view.getByText("span", "Target changed: de")).not.toBeNull();
  });

  it("clears the toast on dismiss and leaves it cleared", async () => {
    const view = await mount();
    emitRefresh(sourceEvent(1, 0));
    await flush();

    await clickAsync(view.get('[aria-label="Dismiss"]'));

    expect(view.query('[aria-label="Dismiss"]')).toBeNull();
  });
});

describe("App agent-tools status", () => {
  it("says nothing about the agent-tools surface while every registration held", async () => {
    const view = await mount();

    expect(view.text()).not.toContain("Agent tools degraded");
  });

  it("shows the degraded notice once the registration pass reports a failure", async () => {
    const view = await mount();

    act(() => {
      agentToolsStatusStore.publish([
        { tool: "verbatra_key_value", errorName: "SecurityError", message: "refused" },
      ]);
    });

    expect(view.text()).toContain("Agent tools degraded: 1 of the agent tool registrations failed");
    expect(view.text()).toContain("SecurityError");
  });
});

describe("App navigation chrome", () => {
  it("counts the entries waiting on the review nav item", async () => {
    const view = await mount();

    expect(view.get('header nav[aria-label="Studio"]').textContent).toContain("2 waiting");
  });

  it("counts nothing while the review queue read has not answered yet", async () => {
    stubRpc({ "review.queue": () => new Promise(() => {}) });

    const view = await mount();

    expect(view.get('header nav[aria-label="Studio"]').textContent).not.toContain("waiting");
  });

  it("keeps the mobile nav drawer closed until it is asked for", async () => {
    const view = await mount();

    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("opens the mobile nav drawer from the header trigger", async () => {
    const view = await mount();

    await clickAsync(view.get('[aria-label^="Open navigation"]'));

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Navigation");
  });

  it("closes the drawer once a page is chosen from it, and navigates", async () => {
    const view = await mount();
    await clickAsync(view.get('[aria-label^="Open navigation"]'));

    await clickAsync(view.getByText('[role="dialog"] nav a', "Settings"));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get("h1").textContent).toBe("Settings");
  });

  it("closes the drawer from its own close button, without navigating", async () => {
    const view = await mount();
    await clickAsync(view.get('[aria-label^="Open navigation"]'));

    await clickAsync(view.get('[role="dialog"] [aria-label="Close navigation"]'));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get("h1").textContent).toBe("Overview");
  });

  it("returns focus to the menu button when the drawer closes on Escape", async () => {
    const view = await mount();
    const trigger = view.get('[aria-label^="Open navigation"]');
    act(() => {
      trigger.focus();
    });
    await clickAsync(trigger);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("App header chrome", () => {
  it("leaves focus alone when the viewport grows while the drawer is closed", async () => {
    let listener: (() => void) | undefined;
    const list = {
      matches: false,
      addEventListener: (_type: string, next: () => void) => {
        listener = next;
      },
      removeEventListener: () => {},
    };
    vi.stubGlobal("matchMedia", () => list);
    const view = await mount();
    const toggle = view.get("[data-theme-toggle]");
    act(() => {
      toggle.focus();
    });

    list.matches = true;
    act(() => listener?.());

    expect(document.activeElement).toBe(toggle);
  });

  it("closes the open drawer when the viewport grows to the wide layout and keeps it closed", async () => {
    let listener: (() => void) | undefined;
    const list = {
      matches: false,
      addEventListener: (_type: string, next: () => void) => {
        listener = next;
      },
      removeEventListener: () => {},
    };
    vi.stubGlobal("matchMedia", () => list);
    const view = await mount();
    await clickAsync(view.get('[aria-label^="Open navigation"]'));
    expect(view.query('[role="dialog"]')).not.toBeNull();

    list.matches = true;
    act(() => listener?.());
    expect(view.query('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(view.get('header nav [aria-current="page"]'));

    list.matches = false;
    act(() => listener?.());
    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("offers a first control that moves focus to the main region", async () => {
    const view = await mount();
    const skip = view.getByText("button", "Skip to main content");

    await clickAsync(skip);

    expect(document.activeElement).toBe(view.get("main#main"));
    expect(view.container.querySelector("button, a, input")).toBe(skip);
  });

  it("keeps the filters of the current page when its own link is chosen", async () => {
    goToHash("#/review?locale=de");
    const view = await mount();

    await clickAsync(navItem(view, "Review"));

    expect(window.location.hash).toBe("#/review?locale=de");
  });

  it("opens the translations list filtered by the header search", async () => {
    goToHash("#/review");
    const view = await mount();

    typeInto(view.get("search input") as HTMLInputElement, "app.title");
    await act(async () => {
      view
        .get("search form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(window.location.hash).toBe("#/translations?q=app.title");
    expect(view.get("h1").textContent).toBe("Translations");
  });

  it("does not run review shortcuts for keys typed in the header search", async () => {
    goToHash("#/review");
    const view = await mount();
    await flush();
    const field = view.get("search input");
    const before = rpcCalls.length;

    for (const key of ["a", "r", "e", "t", "x", "j", "k", "?", "Enter"]) {
      act(() => {
        field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    }

    expect(rpcCalls).toHaveLength(before);
    expect(view.query('[role="dialog"]')).toBeNull();

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    });
    expect(view.query('[role="dialog"]')).not.toBeNull();
  });
});

describe("App review tile", () => {
  it("hands the overview the review count, with no extra read", async () => {
    const view = await mount();

    expect(metricFigure(view, "Waiting for review").textContent).toBe("2");
    expect(metricCard(view, "Waiting for review").querySelector("a")?.getAttribute("href")).toBe(
      "#/review",
    );
    expect(countCalls("review.queue")).toBe(1);
  });

  it("shows N/A for the review tile when the queue could not be read", async () => {
    stubRpc({ "review.queue": rpcError("INTERNAL") });

    const view = await mount();

    expect(metricFigure(view, "Waiting for review").textContent).toBe("N/A");
  });

  it("shows N/A with the reason, and no count or header badge, when the review state is unreadable", async () => {
    stubRpc({
      "review.queue": { ok: true, result: { available: false, reason: "provenance-unreadable" } },
    });

    const view = await mount();

    expect(metricFigure(view, "Waiting for review").textContent).toBe("N/A");
    expect(metricHint(view, "Waiting for review")).toBe(
      "verbatra.provenance.json is corrupt or too new to read.",
    );
    expect(metricFigure(view, "Waiting for review").dataset.valueTone).toBe("default");
    expect(view.query("[data-count-dot]")).toBeNull();
    expect(navItem(view, "Review").textContent).toBe("Review");
  });

  it("shows a failed review read as the page alert, and one Retry re-reads it with the rest", async () => {
    stubRpc({
      "review.queue": answersInOrder([rpcError("INTERNAL"), REVIEW_QUEUE]),
    });
    const view = await mount();
    const before = countCalls("review.queue");

    expect(view.all('[role="alert"]')).toHaveLength(1);
    await clickAsync(view.getByText("button", "Retry"));
    await flush();

    expect(countCalls("review.queue")).toBe(before + 1);
    expect(countCalls("status.check")).toBe(2);
    expect(view.query('[role="alert"]')).toBeNull();
    expect(metricFigure(view, "Waiting for review").textContent).toBe("2");
  });

  it("does not re-read the review queue until Retry is pressed", async () => {
    stubRpc({ "review.queue": rpcError("INTERNAL") });

    await mount();

    expect(countCalls("review.queue")).toBe(1);
  });

  it("adds no review tile to the other pages", async () => {
    goToHash("#/glossary");

    const view = await mount();

    expect(hasMetricCard(view, "Waiting for review")).toBe(false);
  });
});

describe("App scroll on navigation", () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    scrollTo.mockClear();
    vi.stubGlobal("scrollTo", scrollTo);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", NARROW_MEDIA);
  });

  function linkTo(hash: string): HTMLAnchorElement {
    const anchor = document.createElement("a");
    anchor.href = hash;
    document.body.append(anchor);
    return anchor;
  }

  it("scrolls to the top after a header navigation link", async () => {
    const view = await mount();

    await clickAsync(navItem(view, "Glossary"));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("scrolls to the top after a plain link inside the page", async () => {
    await mount();
    const anchor = linkTo("#/review?locale=de");

    await act(async () => {
      anchor.click();
    });
    await flush();
    anchor.remove();

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("does not scroll when the address changes without a link, as on back or forward", async () => {
    await mount();

    await act(async () => {
      window.location.hash = "#/glossary";
    });
    await flush();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll for a replace, as when a filter is typed", async () => {
    goToHash("#/translations");
    await mount();

    await act(async () => {
      replaceRoute({ page: "translations", params: { query: "abc" } });
    });
    await flush();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll for a modified click that opens a new tab", async () => {
    await mount();
    const anchor = linkTo("#/review");

    await act(async () => {
      anchor.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }),
      );
    });
    await flush();
    anchor.remove();

    expect(window.location.hash).toBe("#/review");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls to the top once a held navigation proceeds after the prompt", async () => {
    let proceed: (() => Promise<void>) | undefined;
    const uninstall = installRouteGuard({
      isDirty: () => true,
      onBlock: (next) => {
        proceed = next;
      },
    });
    const view = await mount();

    await clickAsync(navItem(view, "Glossary"));
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => {
      await proceed?.();
    });
    await flush();
    uninstall();

    expect(window.location.hash).toBe("#/glossary");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("does not scroll when a cancelled held navigation is later reached by Back or Forward", async () => {
    const uninstall = installRouteGuard({ isDirty: () => true, onBlock: () => {} });
    const view = await mount();

    await clickAsync(navItem(view, "Glossary"));
    restoreHeldRoute();
    uninstall();
    await act(async () => {
      window.location.hash = "#/glossary";
    });
    await flush();

    expect(window.location.hash).toBe("#/glossary");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll for a replace onto the target of a cancelled held navigation", async () => {
    const uninstall = installRouteGuard({ isDirty: () => true, onBlock: () => {} });
    const view = await mount();

    await clickAsync(navItem(view, "Glossary"));
    restoreHeldRoute();
    uninstall();
    await act(async () => {
      replaceRoute({ page: "glossary", params: {} });
    });
    await flush();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls when the prompt was open for a long time before the navigation proceeded", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let proceed: (() => Promise<void>) | undefined;
    const uninstall = installRouteGuard({
      isDirty: () => true,
      onBlock: (next) => {
        proceed = next;
      },
    });
    const view = await mount();

    await clickAsync(navItem(view, "Glossary"));
    vi.setSystemTime(Date.now() + 3_600_000);
    await act(async () => {
      await proceed?.();
    });
    await flush();
    uninstall();

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  async function mountDirtyGlossary(): Promise<RenderResult> {
    stubPanelReads();
    stubRpc({ "glossary.get": { ok: true, result: FILE_BACKED_GLOSSARY } });
    window.history.replaceState({ idx: 0 }, "", "#/glossary");
    const view = await mount();
    await flush();
    await clickAsync(buttonNamed(view, "Edit checkout"));
    typeInto(textboxNamed(view, "Translation (all locales)"), "Entwurf");
    return view;
  }

  it("scrolls once when a plain link is held by a dirty glossary editor and Discard lets it through", async () => {
    const view = await mountDirtyGlossary();
    const anchor = linkTo("#/review");

    await act(async () => {
      anchor.click();
    });
    await flush();
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
    await clickAsync(elementNamed(view, "[data-unsaved-prompt] button", "Discard"));
    await flush();
    anchor.remove();

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(view.get("h1").textContent).toBe("Review");
  });

  it("never scrolls for a plain link a dirty glossary editor held and Keep editing cancelled", async () => {
    const view = await mountDirtyGlossary();
    const anchor = linkTo("#/review");

    await act(async () => {
      anchor.click();
    });
    await flush();
    await clickAsync(elementNamed(view, "[data-unsaved-prompt] button", "Keep editing"));
    await flush();
    await clickAsync(buttonNamed(view, "Cancel"));
    await act(async () => {
      window.location.hash = "#/review";
    });
    await flush();
    anchor.remove();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("closes the navigation drawer onto the prompt when a link is held, on Glossary and on Translations", async () => {
    const view = await mountDirtyGlossary();
    await clickAsync(view.get('[aria-label^="Open navigation"]'));

    await clickAsync(view.getByText('[role="dialog"] nav a', "Settings"));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();
    expect(document.activeElement).toBe(
      elementNamed(view, "[data-unsaved-prompt] button", "Keep editing"),
    );
  });

  it("closes the navigation drawer when a page's guard holds the link, as on Translations", async () => {
    stubPanelReads();
    window.history.replaceState({ idx: 0 }, "", "#/translations");
    let held = 0;
    const uninstall = installRouteGuard({
      isDirty: () => true,
      onBlock: () => {
        held += 1;
      },
    });
    const view = await mount();
    await clickAsync(view.get('[aria-label^="Open navigation"]'));

    await clickAsync(view.getByText('[role="dialog"] nav a', "Settings"));
    uninstall();

    expect(held).toBe(1);
    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("scrolls once a plain link held by the prompt proceeds", async () => {
    let proceed: (() => Promise<void>) | undefined;
    window.history.replaceState({ idx: 0 }, "", "#/settings");
    const uninstall = installRouteGuard({
      isDirty: () => true,
      onBlock: (next) => {
        proceed = next;
      },
    });
    await mount();
    const anchor = linkTo("#/review");

    await act(async () => {
      anchor.click();
    });
    await flush();
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => {
      await proceed?.();
    });
    await flush();
    uninstall();
    anchor.remove();

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("does not scroll when a plain link held by the prompt is cancelled and reached again", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/settings");
    const uninstall = installRouteGuard({ isDirty: () => true, onBlock: () => {} });
    await mount();
    const anchor = linkTo("#/review");

    await act(async () => {
      anchor.click();
    });
    await flush();
    await act(async () => {
      restoreHeldRoute();
    });
    await flush();
    uninstall();
    await act(async () => {
      window.location.hash = "#/review";
    });
    await flush();
    anchor.remove();

    expect(window.location.hash).toBe("#/review");
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
