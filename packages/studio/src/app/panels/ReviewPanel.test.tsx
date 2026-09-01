// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { KeyValueResult } from "../../shared/rpc/key-value.js";
import type { LocaleValuesResult } from "../../shared/rpc/locale-values.js";
import type { ReviewQueueResult } from "../../shared/rpc/review-queue.js";
import type { ProjectSnapshotResult } from "../../shared/rpc/snapshot.js";
import type { RenderResult } from "../test-support.js";
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
import { ReviewPanel } from "./ReviewPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const QUEUE: ReviewQueueResult = {
  available: true,
  version: 1,
  generatedAt: "2026-05-04T10:15:00.000Z",
  locales: [
    {
      locale: "de",
      status: "succeeded",
      needsReview: [
        { key: "checkout.title", reasons: ["EQUALS_SOURCE"] },
        { key: "checkout.subtitle", reasons: ["LENGTH_RATIO_OUTLIER", "PROVIDER_DEGRADED"] },
      ],
    },
    {
      locale: "fr",
      status: "partial",
      needsReview: [
        { key: "cart.badge", reasons: ["GLOSSARY_TERM_MISSED", "INTEGRITY_REORDERED"] },
      ],
    },
  ],
};

const SNAPSHOT: ProjectSnapshotResult = {
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic" },
  configSource: "verbatra.config.ts",
  glossary: { source: "none" },
  capabilities: { spend: false, writeToDisk: true },
  exposeAgentTools: false,
};

const KEY_VALUE: KeyValueResult = { source: "Checkout", target: "Kasse" };

const LOCALE_VALUES: LocaleValuesResult = [
  {
    locale: "de",
    values: {
      "checkout.title": { source: "Checkout", target: "Kasse" },
      "checkout.subtitle": { source: "Review your order", target: "Bestellung prüfen" },
    },
  },
  {
    locale: "fr",
    values: {
      "cart.badge": { source: "Cart", target: "Panier" },
    },
  },
];

function queueAnswer(result: ReviewQueueResult): {
  readonly ok: true;
  readonly result: ReviewQueueResult;
} {
  return { ok: true, result };
}

function snapshotAnswer(result: ProjectSnapshotResult): {
  readonly ok: true;
  readonly result: ProjectSnapshotResult;
} {
  return { ok: true, result };
}

function stubReview(queue: ReviewQueueResult = QUEUE, snapshot = SNAPSHOT): void {
  stubRpc({ "review.queue": queueAnswer(queue), "project.snapshot": snapshotAnswer(snapshot) });
}

function rowKeys(view: RenderResult): string[] {
  return view.all("tbody tr").map((row) => row.querySelectorAll("td")[1]?.textContent ?? "");
}

function localeFilter(view: RenderResult): HTMLSelectElement {
  const element = view.get('select[aria-label="Filter by locale"]');
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error("the locale filter is not a select element");
  }
  return element;
}

function keyFilter(view: RenderResult): HTMLInputElement {
  const element = view.get('input[aria-label="Filter by key or translation text"]');
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("the key filter is not an input element");
  }
  return element;
}

function rowAction(view: RenderResult, key: string, name: string): HTMLElement {
  const row = view
    .all("tbody tr")
    .find((candidate) => candidate.querySelectorAll("td")[1]?.textContent === key);
  const button = [...(row?.querySelectorAll<HTMLElement>("button") ?? [])].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (button === undefined) {
    throw new Error(`no ${name} button in the row for ${JSON.stringify(key)}`);
  }
  return button;
}

async function openEditor(view: RenderResult, key: string): Promise<void> {
  stubRpc({ "key.value": { ok: true, result: KEY_VALUE } });
  await clickAsync(rowAction(view, key, "Edit"));
}

describe("ReviewPanel", () => {
  it("names the page in its header", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.get("h1").textContent).toBe("Review");
    expect(view.getByText("p", "Workspace")).toBeTruthy();
  });

  it("announces the queue as loading while the read is still open", () => {
    stubRpc({
      "review.queue": () => new Promise(() => {}),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
    });

    const view = render(<ReviewPanel refreshToken={0} />);

    expect(view.get('[role="status"]').textContent?.trim()).toBe("Loading review queue…");
    expect(view.query("table")).toBeNull();
  });

  it("reads the queue, the capabilities, and locale values once each, with no parameters", async () => {
    stubReview();

    await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(rpcCalls).toEqual([
      { method: "review.queue", params: {} },
      { method: "project.snapshot", params: {} },
      { method: "locale.values", params: {} },
    ]);
  });

  it("re-reads the queue and locale values, but not the capabilities, when the refresh token changes", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    view.rerender(<ReviewPanel refreshToken={1} />);
    await flush();

    expect(rpcCalls).toEqual([
      { method: "review.queue", params: {} },
      { method: "project.snapshot", params: {} },
      { method: "locale.values", params: {} },
      { method: "review.queue", params: {} },
      { method: "locale.values", params: {} },
    ]);
  });

  it("renders a first queue read that fails as a hard error", async () => {
    stubRpc({
      "review.queue": rpcError("INTERNAL"),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.get('[role="alert"]').textContent?.trim()).toBe(
      "An unexpected server error occurred. Check the terminal running Studio for details.",
    );
    expect(view.query("table")).toBeNull();
  });

  it("invites a first run, not an error, when no snapshot has ever been persisted", async () => {
    stubReview({ available: false });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.text()).toContain("No run recorded yet");
    expect(view.text()).toContain("to populate this queue.");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("reports an all-clear when the run flagged nothing", async () => {
    stubReview({
      available: true,
      version: 1,
      generatedAt: "2026-05-04T10:15:00.000Z",
      locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.text()).toContain("All clear");
    expect(view.query("table")).toBeNull();
  });

  it("flattens the snapshot into one row per flagged locale and key", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(rowKeys(view)).toEqual(["checkout.title", "checkout.subtitle", "cart.badge"]);
    expect(view.all("tbody tr")[2]?.querySelectorAll("td")[0]?.textContent).toBe("fr");
  });

  it("labels every reason code rather than rendering the raw code", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const chips = view.all("tbody span.rounded-sm").map((chip) => chip.textContent);

    expect(chips).toEqual([
      "Matches source text",
      "Unusual length",
      "Provider degraded",
      "Glossary term missed",
      "Placeholders reordered",
    ]);
    expect(view.text()).not.toContain("EQUALS_SOURCE");
  });

  it("tones a provider degradation apart from the value-level findings", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const chips = view.all("tbody span.rounded-sm");

    expect(chips[1]?.className).toContain("bg-warning-soft");
    expect(chips[2]?.className).toContain("bg-neutral-soft");
  });

  it("offers the row actions when the session may write to disk", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.all("thead th").map((cell) => cell.textContent)).toEqual([
      "Locale",
      "Key",
      "Reasons",
      "Actions",
    ]);
    expect(rowAction(view, "cart.badge", "Approve")).toBeTruthy();
  });

  it("hides the row actions when the server would refuse a write", async () => {
    stubReview(QUEUE, { ...SNAPSHOT, capabilities: { spend: false, writeToDisk: false } });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.all("thead th").map((cell) => cell.textContent)).toEqual([
      "Locale",
      "Key",
      "Reasons",
    ]);
    expect(view.query("tbody button")).toBeNull();
  });

  it("hides the row actions while the capabilities read has not answered", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": rpcError("SESSION_EXPIRED"),
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.query("tbody button")).toBeNull();
    expect(rowKeys(view)).toHaveLength(3);
  });

  it("narrows the table to one locale, and counts the matches", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    selectOption(localeFilter(view), "fr");

    expect(rowKeys(view)).toEqual(["cart.badge"]);
    expect(view.text()).toContain("1 entry");
  });

  it("offers one filter option per locale present in the queue, plus an all-locales default", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.all("option").map((option) => option.textContent)).toEqual([
      "All locales",
      "de",
      "fr",
    ]);
  });

  it("narrows the table by a case-insensitive key substring", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    typeInto(keyFilter(view), "CHECKOUT.");

    expect(rowKeys(view)).toEqual(["checkout.title", "checkout.subtitle"]);
    expect(view.text()).toContain("2 entries");
  });

  it("matches a query found only in a row's target value, not its key", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": { ok: true, result: LOCALE_VALUES },
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    typeInto(keyFilter(view), "prüfen");

    expect(rowKeys(view)).toEqual(["checkout.subtitle"]);
  });

  it("matches a query found only in a row's source value, not its key", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": { ok: true, result: LOCALE_VALUES },
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    typeInto(keyFilter(view), "your order");

    expect(rowKeys(view)).toEqual(["checkout.subtitle"]);
  });

  it("does not match a row whose locale carries no value entry for that key (no false positive)", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": { ok: true, result: LOCALE_VALUES },
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    typeInto(keyFilter(view), "panier");

    expect(rowKeys(view)).toEqual(["cart.badge"]);
    typeInto(keyFilter(view), "kasse");
    expect(rowKeys(view)).toEqual(["checkout.title"]);
    typeInto(keyFilter(view), "no such text anywhere");
    expect(rowKeys(view)).toEqual([]);
  });

  it("still matches on the key when locale values have not loaded yet", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": () => new Promise(() => {}),
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    typeInto(keyFilter(view), "cart.badge");

    expect(rowKeys(view)).toEqual(["cart.badge"]);
  });

  it("explains an over-narrow filter and clears both fields on request", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    selectOption(localeFilter(view), "fr");
    typeInto(keyFilter(view), "checkout");

    expect(view.query("table")).toBeNull();
    expect(view.text()).toContain("No matching entries");

    await clickAsync(view.getByText("button", "Clear filters"));

    expect(rowKeys(view)).toHaveLength(3);
    expect(localeFilter(view).value).toBe("");
    expect(keyFilter(view).value).toBe("");
  });

  it("hides an approved row for the rest of the session without calling the server", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const before = rpcCalls.length;
    await clickAsync(rowAction(view, "checkout.title", "Approve"));

    expect(rowKeys(view)).toEqual(["checkout.subtitle", "cart.badge"]);
    expect(rpcCalls).toHaveLength(before);
  });

  it("hides a rejected row for the rest of the session without calling the server", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const before = rpcCalls.length;
    await clickAsync(rowAction(view, "cart.badge", "Reject"));

    expect(rowKeys(view)).toEqual(["checkout.title", "checkout.subtitle"]);
    expect(rpcCalls).toHaveLength(before);
  });

  it("keeps an actioned row hidden across a live-refresh re-fetch", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowAction(view, "checkout.title", "Approve"));
    view.rerender(<ReviewPanel refreshToken={1} />);
    await flush();

    expect(rowKeys(view)).toEqual(["checkout.subtitle", "cart.badge"]);
  });

  it("opens the editor for the row that was clicked", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await openEditor(view, "cart.badge");

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Edit cart.badge in fr");
    expect(rpcCalls.at(-1)).toEqual({
      method: "key.value",
      params: { locale: "fr", key: "cart.badge" },
    });
  });

  it("closes the editor on Escape, leaving the row in the queue", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await openEditor(view, "cart.badge");
    pressKey("Escape");
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rowKeys(view)).toHaveLength(3);
  });

  it("hides the row and closes the editor once the server accepts the edit", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await openEditor(view, "checkout.title");
    stubRpc({ "translation.editEntry": { ok: true, result: { accepted: true, value: "Kasse" } } });
    await clickAsync(view.getByText("button", "Save"));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rowKeys(view)).toEqual(["checkout.subtitle", "cart.badge"]);
    expect(rpcCalls.at(-1)).toEqual({
      method: "translation.editEntry",
      params: { locale: "de", key: "checkout.title", value: "Kasse" },
    });
  });

  it("surfaces a failed edit in the editor and keeps the row in the queue", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await openEditor(view, "checkout.title");
    stubRpc({
      "translation.editEntry": rpcError(
        "LOCK_CONTENDED",
        "the locale is locked by another process",
      ),
    });
    await clickAsync(view.getByText("button", "Save"));

    expect(view.text()).toContain("Failed: the locale is locked by another process");
    expect(view.query('[role="dialog"]')).not.toBeNull();
    expect(rowKeys(view)).toHaveLength(3);
  });

  it("keeps the last known queue, marked stale, when a re-fetch fails", async () => {
    let attempts = 0;
    stubRpc({
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "review.queue": () => {
        attempts += 1;
        return attempts === 1
          ? queueAnswer(QUEUE)
          : rpcError("QUEUE_UNREADABLE", "the run snapshot could not be read");
      },
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    view.rerender(<ReviewPanel refreshToken={1} />);
    await flush();

    expect(view.get('[role="alert"]').textContent?.trim()).toBe(
      "Showing the last known queue. the run snapshot could not be read",
    );
    expect(rowKeys(view)).toHaveLength(3);
  });
});
