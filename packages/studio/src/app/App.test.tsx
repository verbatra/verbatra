// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_IDS, type PageId } from "../client/routes.js";
import type { RefreshEvent } from "../shared/sse-events.js";
import { App } from "./App.js";
import {
  agentToolsStatusStore,
  clickAsync,
  emitRefresh,
  flush,
  type RenderResult,
  renderAsync,
  rpcCalls,
  sessionStore,
  stubRpc,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const MACHINE = { origin: "machine", reviewState: "unreviewed" } as const;

const PAGE_HEADINGS: Readonly<Record<PageId, string>> = {
  translations: "Translations",
  review: "Review",
  activity: "Activity",
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
    .all("aside nav button")
    .find((button) => button.textContent?.startsWith(label) === true);
  if (match === undefined) {
    throw new Error(`no rail nav item labeled ${label}`);
  }
  return match;
}

beforeEach(() => {
  goToHash("/");
  window.localStorage.clear();
  stubPanelReads();
});

describe("App routing", () => {
  it("lands on the daily workspace when the URL carries no hash", async () => {
    const view = await mount();

    expect(view.get("h1").textContent).toBe("Translations");
  });

  for (const page of PAGE_IDS) {
    it(`renders the ${page} panel for its canonical hash`, async () => {
      goToHash(`#/${page}`);

      const view = await mount();

      expect(view.get("h1").textContent).toBe(PAGE_HEADINGS[page]);
    });
  }

  it("accepts the bare hash form an older link may carry", async () => {
    goToHash("#activity");

    const view = await mount();

    expect(view.get("h1").textContent).toBe("Activity");
  });

  it("falls back to the workspace for a hash no version of the dashboard knows", async () => {
    goToHash("#/nonsense");

    const view = await mount();

    expect(view.get("h1").textContent).toBe("Translations");
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

    await clickAsync(navItem(view, "Activity"));

    expect(window.location.hash).toBe("#/activity");
  });

  it("swaps the rendered panel when a nav item is chosen", async () => {
    const view = await mount();

    await clickAsync(navItem(view, "Review"));

    expect(view.get("h1").textContent).toBe("Review");
  });

  it("names the current page in the header row alongside the panel heading", async () => {
    goToHash("#/settings");

    const view = await mount();

    expect(view.get("header span").textContent).toBe("Settings");
  });

  it("marks the chosen nav item as the current page", async () => {
    const view = await mount();

    await clickAsync(navItem(view, "Review"));

    expect(view.get('aside [aria-current="page"]').textContent).toContain("Review");
  });
});

describe("App session expiry", () => {
  it("replaces the whole shell with the terminal notice once the session expires", async () => {
    const view = await mount();

    act(() => {
      sessionStore.markSessionExpired();
    });

    expect(view.query("aside")).toBeNull();
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

    expect(view.get('aside nav[aria-label="Workspace"]').textContent).toContain("2 waiting");
  });

  it("counts nothing while the review queue read has not answered yet", async () => {
    stubRpc({ "review.queue": () => new Promise(() => {}) });

    const view = await mount();

    expect(view.get('aside nav[aria-label="Workspace"]').textContent).not.toContain("waiting");
  });

  it("starts expanded for a first visit, with nothing stored", async () => {
    const view = await mount();

    expect(view.get('[aria-label="Collapse sidebar"]')).not.toBeNull();
  });

  it("collapses the rail on request and remembers the choice", async () => {
    const view = await mount();

    await clickAsync(view.get('[aria-label="Collapse sidebar"]'));

    expect(view.get('[aria-label="Expand sidebar"]')).not.toBeNull();
    expect(window.localStorage.getItem("verbatra-studio-sidebar")).toBe("collapsed");
  });

  it("expands the rail again and remembers that choice too", async () => {
    const view = await mount();
    await clickAsync(view.get('[aria-label="Collapse sidebar"]'));

    await clickAsync(view.get('[aria-label="Expand sidebar"]'));

    expect(view.get('[aria-label="Collapse sidebar"]')).not.toBeNull();
    expect(window.localStorage.getItem("verbatra-studio-sidebar")).toBe("expanded");
  });

  it("restores a collapsed rail from a previous session", async () => {
    window.localStorage.setItem("verbatra-studio-sidebar", "collapsed");

    const view = await mount();

    expect(view.get('[aria-label="Expand sidebar"]')).not.toBeNull();
  });

  it("keeps the mobile nav drawer closed until it is asked for", async () => {
    const view = await mount();

    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("opens the mobile nav drawer from the header trigger", async () => {
    const view = await mount();

    await clickAsync(view.get('[aria-label="Open navigation"]'));

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Navigation");
  });

  it("closes the drawer once a page is chosen from it, and navigates", async () => {
    const view = await mount();
    await clickAsync(view.get('[aria-label="Open navigation"]'));

    await clickAsync(view.getByText('[role="dialog"] button', "Settings"));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get("h1").textContent).toBe("Settings");
  });

  it("closes the drawer from its own close button, without navigating", async () => {
    const view = await mount();
    await clickAsync(view.get('[aria-label="Open navigation"]'));

    await clickAsync(view.get('[role="dialog"] [aria-label="Close navigation"]'));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get("h1").textContent).toBe("Translations");
  });
});
