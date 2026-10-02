// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { KeyContextResult } from "../../shared/rpc/key-context.js";
import type { LocaleValuesResult } from "../../shared/rpc/locale-values.js";
import type { ReviewDecisionResult } from "../../shared/rpc/review-decision.js";
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

const MACHINE = { origin: "machine", reviewState: "unreviewed" } as const;

const QUEUE: ReviewQueueResult = {
  available: true,
  locales: [
    {
      locale: "de",
      needsReview: [
        { key: "checkout.title", reasons: ["EQUALS_SOURCE"], provenance: MACHINE },
        {
          key: "checkout.subtitle",
          reasons: ["LENGTH_RATIO_OUTLIER", "PROVIDER_DEGRADED"],
          provenance: MACHINE,
        },
      ],
    },
    {
      locale: "fr",
      needsReview: [
        {
          key: "cart.badge",
          reasons: ["GLOSSARY_TERM_MISSED", "INTEGRITY_REORDERED"],
          provenance: MACHINE,
        },
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

const KEY_VALUE: KeyContextResult = {
  source: "Checkout",
  target: "Kasse",
  glossary: { terms: [], doNotTranslate: [] },
};

const LOCALE_VALUES: LocaleValuesResult = [
  {
    locale: "de",
    keys: ["checkout.title", "checkout.subtitle"],
    values: {
      "checkout.title": { source: "Checkout", target: "Kasse" },
      "checkout.subtitle": { source: "Review your order", target: "Bestellung prüfen" },
    },
  },
  {
    locale: "fr",
    keys: ["cart.badge"],
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

function rowKeyOf(row: Element): string {
  return row.querySelector("[data-row-key]")?.textContent ?? "";
}

function rowKeys(view: RenderResult): string[] {
  return view.all("tbody tr").map(rowKeyOf);
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
  const row = view.all("tbody tr").find((candidate) => rowKeyOf(candidate) === key);
  const button = [...(row?.querySelectorAll<HTMLElement>("button") ?? [])].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (button === undefined) {
    throw new Error(`no ${name} button in the row for ${JSON.stringify(key)}`);
  }
  return button;
}

function busyRetranslate(view: RenderResult, key: string): HTMLElement {
  const row = view.all("tbody tr").find((candidate) => rowKeyOf(candidate) === key);
  const button = [...(row?.querySelectorAll<HTMLElement>("button") ?? [])].find((candidate) =>
    candidate.textContent?.startsWith("Retranslating…"),
  );
  if (button === undefined) {
    throw new Error(`no running Retranslate button in the row for ${JSON.stringify(key)}`);
  }
  return button;
}

async function openEditor(view: RenderResult, key: string): Promise<void> {
  stubRpc({ "key.context": { ok: true, result: KEY_VALUE } });
  await clickAsync(rowAction(view, key, "Edit"));
}

function stubDecisionReady(): void {
  stubRpc({
    "review.queue": queueAnswer(QUEUE),
    "project.snapshot": snapshotAnswer(SNAPSHOT),
    "locale.values": { ok: true, result: LOCALE_VALUES },
  });
}

function without(key: string): ReviewQueueResult {
  if (!QUEUE.available) {
    return QUEUE;
  }
  return {
    ...QUEUE,
    locales: QUEUE.locales.map((locale) => ({
      ...locale,
      needsReview: locale.needsReview.filter((entry) => entry.key !== key),
    })),
  };
}

function decided(
  locale: string,
  key: string,
  reviewState: "approved" | "rejected",
): ReviewDecisionResult {
  return { locale, key, provenance: { origin: "machine", reviewState } };
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
      { method: "review.queue", params: { includeApproved: true } },
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
      { method: "review.queue", params: { includeApproved: true } },
      { method: "project.snapshot", params: {} },
      { method: "locale.values", params: {} },
      { method: "review.queue", params: { includeApproved: true } },
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

  it("explains an unreadable provenance file instead of showing an empty queue", async () => {
    stubReview({ available: false, reason: "provenance-unreadable" });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.text()).toContain("Review state cannot be read");
    expect(view.text()).toContain("verbatra.provenance.json is corrupt");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("reports an all-clear when the run flagged nothing", async () => {
    stubReview({
      available: true,
      locales: [{ locale: "de", needsReview: [] }],
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.text()).toContain("All clear");
    expect(view.query("table")).toBeNull();
  });

  it("flattens the snapshot into one row per flagged locale and key", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(rowKeys(view)).toEqual(["checkout.title", "checkout.subtitle", "cart.badge"]);
    expect(view.all("tbody tr")[2]?.querySelectorAll("td")[1]?.textContent).toBe("fr");
  });

  it("labels every reason code rather than rendering the raw code", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const chips = view
      .all("tbody span.rounded-sm")
      .map((chip) => chip.textContent)
      .filter((text) => !text?.includes("Origin:"));

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
      "",
      "Locale",
      "Key",
      "Reasons",
      "Actions",
    ]);
    expect(view.get('thead input[type="checkbox"]').getAttribute("aria-label")).toBe(
      "Select every shown entry",
    );
    expect(rowAction(view, "cart.badge", "Approve")).toBeTruthy();
  });

  it("sizes the actions column for a running retranslation up front, so a busy row never shifts the table", async () => {
    stubReview(QUEUE, SPEND_SNAPSHOT);
    const withSpend = await renderAsync(<ReviewPanel refreshToken={0} />);
    const actionsOf = (view: RenderResult): string[] =>
      (rowAction(view, "cart.badge", "Edit").parentElement?.className ?? "").split(" ");

    expect(actionsOf(withSpend)).toContain("min-w-106");
    expect(withSpend.get("th[data-actions-column]").className).not.toContain("w-110");
    withSpend.unmount();

    stubReview();
    const withoutSpend = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(actionsOf(withoutSpend)).not.toContain("min-w-106");
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

    expect(localeFilter(view).querySelectorAll("option").length).toBe(3);
    expect([...localeFilter(view).options].map((option) => option.textContent)).toEqual([
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

  it("disables approve and reject until the row's current translation is known", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": () => new Promise(() => {}),
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect((rowAction(view, "cart.badge", "Approve") as HTMLButtonElement).disabled).toBe(true);
    expect((rowAction(view, "cart.badge", "Reject…") as HTMLButtonElement).disabled).toBe(true);
    expect((rowAction(view, "cart.badge", "Edit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves an approval against the value on screen and drops the row once the queue reloads", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({
      "review.approve": { ok: true, result: decided("de", "checkout.title", "approved") },
      "review.queue": queueAnswer(without("checkout.title")),
    });

    await clickAsync(rowAction(view, "checkout.title", "Approve"));
    await flush();

    expect(rpcCalls.find((call) => call.method === "review.approve")).toEqual({
      method: "review.approve",
      params: { locale: "de", key: "checkout.title", expectedValue: "Kasse" },
    });
    expect(rowKeys(view)).toEqual(["checkout.subtitle", "cart.badge"]);
    expect(view.get('[role="status"]').textContent).toBe(
      "Approved checkout.title (de). The decision is saved in verbatra.provenance.json.",
    );
  });

  it("keeps the row and names the reason when the approval is refused", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "review.approve": rpcError("REVIEW_VALUE_CHANGED", "changed") });

    await clickAsync(rowAction(view, "checkout.title", "Approve"));
    await flush();

    expect(rowKeys(view)).toHaveLength(3);
    expect(view.get('[role="alert"]').textContent).toContain(
      "Could not approve checkout.title (de): This translation changed since the queue was loaded",
    );
    expect((rowAction(view, "checkout.title", "Approve") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("reloads the queue and the values after a stale approval, so a retry sends the new value", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const changed: LocaleValuesResult = [
      {
        locale: "de",
        keys: ["checkout.title", "checkout.subtitle"],
        values: {
          "checkout.title": { source: "Checkout", target: "Zur Kasse" },
          "checkout.subtitle": { source: "Review your order", target: "Bestellung prüfen" },
        },
      },
      {
        locale: "fr",
        keys: ["cart.badge"],
        values: { "cart.badge": { source: "Cart", target: "Panier" } },
      },
    ];
    stubRpc({
      "review.approve": rpcError("REVIEW_VALUE_CHANGED", "changed"),
      "locale.values": { ok: true, result: changed },
    });
    const before = rpcCalls.length;

    await clickAsync(rowAction(view, "checkout.title", "Approve"));
    await flush();

    const reloaded = rpcCalls.slice(before).map((call) => call.method);
    expect(reloaded).toContain("review.queue");
    expect(reloaded).toContain("locale.values");
    expect(view.get('[role="alert"]').textContent).toContain(
      "Could not approve checkout.title (de)",
    );

    stubRpc({
      "review.approve": { ok: true, result: decided("de", "checkout.title", "approved") },
    });
    await clickAsync(rowAction(view, "checkout.title", "Approve"));

    expect(rpcCalls.filter((call) => call.method === "review.approve").at(-1)?.params).toEqual({
      locale: "de",
      key: "checkout.title",
      expectedValue: "Zur Kasse",
    });
  });

  it("closes the reject dialog and reloads when the value changed underneath it", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowAction(view, "cart.badge", "Reject…"));
    stubRpc({ "review.reject": rpcError("REVIEW_VALUE_CHANGED", "changed") });
    const before = rpcCalls.length;

    await clickAsync(view.getByText("button", "Reject and remove"));
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rpcCalls.slice(before).map((call) => call.method)).toContain("locale.values");
    expect(view.get('[role="alert"]').textContent).toContain("Could not reject cart.badge (fr)");
  });

  it("shows each row's current translation under its key, in full on hover", async () => {
    stubDecisionReady();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const row = view.all("tbody tr").find((candidate) => rowKeyOf(candidate) === "cart.badge");
    const shown = row?.querySelector("[data-row-value]");

    expect(shown?.textContent).toBe("Panier");
    expect(shown?.getAttribute("title")).toBe("Panier");
    expect(shown?.className).toContain("truncate");
  });

  it("gives a right-to-left value its own direction, isolates its tokens, and starts it at the key's edge", async () => {
    const arQueue: ReviewQueueResult = {
      available: true,
      locales: [
        {
          locale: "ar",
          needsReview: [{ key: "order.ready", reasons: ["EQUALS_SOURCE"], provenance: MACHINE }],
        },
      ],
    };
    const arValues: LocaleValuesResult = [
      {
        locale: "ar",
        keys: ["order.ready"],
        values: {
          "order.ready": {
            source: "Order #{orderId}",
            target: "طلب #{orderId} {count, plural, one {# عنصر} other {# عناصر}}",
          },
        },
      },
    ];
    stubRpc({
      "review.queue": queueAnswer(arQueue),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": { ok: true, result: arValues },
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const shown = view.get("[data-row-value]");

    expect(shown.getAttribute("dir")).toBe("rtl");
    expect(shown.getAttribute("lang")).toBe("ar");
    expect(shown.className).toContain("w-fit");
    expect(shown.className).toContain("text-start");
    expect(shown.className).toContain("max-w-full");
    expect(shown.className).not.toContain("font-mono");
    expect(
      Array.from(shown.querySelectorAll("bdi[dir='ltr']")).map((node) => node.textContent),
    ).toEqual(["#{orderId}", "{count, plural,", "one {", "#", "} other {", "#", "}", "}"]);
    expect(view.all("[dir]").filter((node) => node !== shown && !shown.contains(node))).toEqual([]);
  });

  it("says the translation is loading until the values arrive", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": () => new Promise(() => {}),
    });

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.text()).toContain("Loading the current translation…");
  });

  it("marks the row busy while approving, Edit included, and announces it", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "review.approve": () => new Promise(() => {}) });

    await clickAsync(rowAction(view, "checkout.title", "Approve"));

    for (const name of ["Edit", "Approving…", "Reject…"]) {
      expect((rowAction(view, "checkout.title", name) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("keeps the row busy until the queue reload after an approval has answered", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({
      "review.approve": { ok: true, result: decided("de", "checkout.title", "approved") },
      "review.queue": () => new Promise(() => {}),
    });

    await clickAsync(rowAction(view, "checkout.title", "Approve"));
    await flush();

    expect((rowAction(view, "checkout.title", "Edit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("announces the decision and moves focus to the next row once the reload settles", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({
      "review.approve": { ok: true, result: decided("de", "checkout.title", "approved") },
      "review.queue": queueAnswer(without("checkout.title")),
    });

    await clickAsync(rowAction(view, "checkout.title", "Approve"));
    await flush();

    expect(view.get('[role="status"][data-decision-status]').textContent).toContain(
      "Approved checkout.title (de).",
    );
    expect(document.activeElement?.tagName).toBe("TR");
    expect(document.activeElement?.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement?.querySelector("[data-row-key]")?.textContent).not.toBe(
      "checkout.title",
    );
  });

  it("keeps focus on the row after a refused approval", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "review.approve": rpcError("LOCK_CONTENDED", "busy") });

    await clickAsync(rowAction(view, "checkout.title", "Approve"));
    await flush();

    expect(document.activeElement?.querySelector("[data-row-key]")?.textContent).toBe(
      "checkout.title",
    );
  });

  it("frees the row again after a refusal that is not about a changed value", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "review.approve": rpcError("LOCK_CONTENDED", "busy") });

    await clickAsync(rowAction(view, "checkout.title", "Approve"));
    await flush();

    expect((rowAction(view, "checkout.title", "Edit") as HTMLButtonElement).disabled).toBe(false);
    expect(view.get('[role="alert"]').textContent).toContain("Could not approve checkout.title");
  });

  it("asks for confirmation before rejecting, and cancelling calls nothing", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const before = rpcCalls.length;

    await clickAsync(rowAction(view, "cart.badge", "Reject…"));

    const dialog = view.get('[role="dialog"]');
    expect(dialog.getAttribute("aria-label")).toBe("Reject cart.badge in fr");
    expect(dialog.textContent).toContain("Panier");
    expect(dialog.textContent).toContain("The translation is removed from the fr locale file.");

    await clickAsync(view.getByText("button", "Cancel"));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rpcCalls).toHaveLength(before);
    expect(rowKeys(view)).toHaveLength(3);
  });

  it("rejects the value on screen once confirmed, closes the dialog, and reloads the queue", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowAction(view, "cart.badge", "Reject…"));
    stubRpc({
      "review.reject": { ok: true, result: decided("fr", "cart.badge", "rejected") },
      "review.queue": queueAnswer(without("cart.badge")),
    });

    await clickAsync(view.getByText("button", "Reject and remove"));
    await flush();

    expect(rpcCalls.find((call) => call.method === "review.reject")).toEqual({
      method: "review.reject",
      params: { locale: "fr", key: "cart.badge", expectedValue: "Panier" },
    });
    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rowKeys(view)).toEqual(["checkout.title", "checkout.subtitle"]);
    expect(view.get('[role="status"]').textContent).toBe(
      "Rejected cart.badge (fr). Its translation was removed and the decision is saved in verbatra.provenance.json.",
    );
  });

  it("focuses the next row once a rejection from the row button settles, not the removed trigger", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowAction(view, "checkout.title", "Reject…"));
    stubRpc({
      "review.reject": { ok: true, result: decided("de", "checkout.title", "rejected") },
      "review.queue": queueAnswer(without("checkout.title")),
    });

    await clickAsync(view.getByText("button", "Reject and remove"));
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.tagName).toBe("TR");
    expect(document.activeElement?.getAttribute("aria-current")).toBe("true");
    expect(rowKeyOf(document.activeElement as Element)).toBe("checkout.subtitle");
  });

  it("keeps the reject dialog open with the reason when the rejection fails", async () => {
    stubDecisionReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowAction(view, "cart.badge", "Reject…"));
    stubRpc({ "review.reject": rpcError("REVIEW_REJECT_UNSUPPORTED", "unsupported") });

    await clickAsync(view.getByText("button", "Reject and remove"));
    await flush();

    expect(view.get('[role="dialog"]').textContent).toContain(
      "Failed: This project's file format cannot drop a single translation",
    );
    expect(rowKeys(view)).toHaveLength(3);
  });

  it("opens the editor for the row that was clicked", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await openEditor(view, "cart.badge");

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Edit cart.badge in fr");
    expect(rpcCalls.find((call) => call.method === "key.context")).toEqual({
      method: "key.context",
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

  it("closes the editor and re-reads the queue, which drops the row a person rewrote", async () => {
    stubReview();

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await openEditor(view, "checkout.title");
    stubRpc({
      "translation.editEntry": { ok: true, result: { accepted: true, value: "Kasse" } },
      "review.queue": queueAnswer(without("checkout.title")),
    });
    await clickAsync(view.getByText("button", "Save"));
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rowKeys(view)).toEqual(["checkout.subtitle", "cart.badge"]);
    expect(rpcCalls).toContainEqual({
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

const SPEND_SNAPSHOT: ProjectSnapshotResult = {
  ...SNAPSHOT,
  capabilities: { spend: true, writeToDisk: true },
};

function stubKeyboardReady(snapshot: ProjectSnapshotResult = SNAPSHOT): void {
  stubRpc({
    "review.queue": queueAnswer(QUEUE),
    "project.snapshot": snapshotAnswer(snapshot),
    "locale.values": { ok: true, result: LOCALE_VALUES },
  });
}

function activeRowKey(view: RenderResult): string | null {
  const row = view.query("tbody tr[data-active]");
  return row === null ? null : rowKeyOf(row);
}

function pressOn(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("ReviewPanel: keyboard queue", () => {
  it("highlights no row until a navigation key is pressed, then walks the rows and moves focus", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(activeRowKey(view)).toBeNull();
    pressKey("j");
    expect(activeRowKey(view)).toBe("checkout.title");
    expect(document.activeElement).toBe(view.get("tbody tr[data-active]"));
    pressKey("ArrowDown");
    pressKey("j");
    pressKey("j");
    expect(activeRowKey(view)).toBe("cart.badge");
    pressKey("k");
    expect(activeRowKey(view)).toBe("checkout.subtitle");
    pressKey("ArrowUp");
    pressKey("ArrowUp");
    expect(activeRowKey(view)).toBe("checkout.title");
  });

  it("moves nowhere when the filter leaves no row", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    typeInto(keyFilter(view), "no such key");
    await flush();

    pressKey("j");
    pressKey("a");

    expect(view.query("tbody")).toBeNull();
    expect(rpcCalls.some((call) => call.method === "review.approve")).toBe(false);
  });

  it("makes exactly the highlighted row tabbable and marks it current", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");
    pressKey("j");

    expect(view.all("tbody tr").map((row) => row.getAttribute("tabindex"))).toEqual([
      "-1",
      "0",
      "-1",
    ]);
    expect(view.get("tbody tr[data-active]").getAttribute("aria-current")).toBe("true");
  });

  it("highlights the row that was clicked", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    const row = view.all("tbody tr").find((candidate) => rowKeyOf(candidate) === "cart.badge");

    await clickAsync(row as HTMLElement);

    expect(activeRowKey(view)).toBe("cart.badge");
  });

  it("approves the highlighted row with a, against the value on screen", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({
      "review.approve": { ok: true, result: decided("de", "checkout.subtitle", "approved") },
      "review.queue": queueAnswer(without("checkout.subtitle")),
    });

    pressKey("j");
    pressKey("j");
    pressKey("a");
    await flush();
    await flush();

    expect(rpcCalls.find((call) => call.method === "review.approve")?.params).toEqual({
      locale: "de",
      key: "checkout.subtitle",
      expectedValue: "Bestellung prüfen",
    });
    expect(rowKeys(view)).toEqual(["checkout.title", "cart.badge"]);
    expect(activeRowKey(view)).toBe("cart.badge");
  });

  it("ignores a second decision on a row that is still being approved", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "review.approve": () => new Promise(() => {}) });

    pressKey("j");
    pressKey("a");
    await flush();
    pressKey("a");
    pressKey("e");
    await flush();

    expect(rpcCalls.filter((call) => call.method === "review.approve")).toHaveLength(1);
    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("opens the reject confirmation for the highlighted row with r", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");
    pressKey("r");

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe(
      "Reject checkout.title in de",
    );
  });

  it("focuses the next row once a rejection opened with r settles", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    pressKey("j");
    pressKey("j");
    pressKey("r");
    await flush();
    stubRpc({
      "review.reject": { ok: true, result: decided("de", "checkout.subtitle", "rejected") },
      "review.queue": queueAnswer(without("checkout.subtitle")),
    });

    await clickAsync(view.getByText("button", "Reject and remove"));
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.getAttribute("aria-current")).toBe("true");
    expect(rowKeyOf(document.activeElement as Element)).toBe("cart.badge");
  });

  it("does not approve or reject a row whose current value has not loaded", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": () => new Promise(() => {}),
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");
    pressKey("a");
    pressKey("r");
    await flush();

    expect(rpcCalls.some((call) => call.method === "review.approve")).toBe(false);
    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it.each(["e", "Enter"])("opens the editor for the highlighted row with %s", async (key) => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "key.context": { ok: true, result: KEY_VALUE } });

    pressKey("j");
    pressOn(view.get("tbody tr[data-active]"), key);
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe(
      "Edit checkout.title in de",
    );
  });

  it("leaves Enter on a focused button to that button", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");
    pressOn(rowAction(view, "checkout.title", "Approve"), "Enter");

    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("pauses every shortcut while typing in the filter", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressOn(keyFilter(view), "j");

    expect(activeRowKey(view)).toBeNull();
  });

  it("ignores a shortcut pressed with a modifier, so browser shortcuts keep working", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j", { ctrlKey: true });
    pressKey("j", { metaKey: true });
    pressKey("j", { altKey: true });

    expect(activeRowKey(view)).toBeNull();
  });

  it("pauses the queue shortcuts while a dialog is open", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "key.context": { ok: true, result: KEY_VALUE } });

    pressKey("j");
    pressKey("e");
    await flush();
    pressKey("a");
    pressKey("j");

    expect(rpcCalls.some((call) => call.method === "review.approve")).toBe(false);
    expect(activeRowKey(view)).toBe("checkout.title");
  });

  it("offers no row shortcut when the session may not write to disk", async () => {
    stubKeyboardReady({ ...SNAPSHOT, capabilities: { spend: false, writeToDisk: false } });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");
    pressKey("e");
    pressKey("r");

    expect(activeRowKey(view)).toBe("checkout.title");
    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("opens and closes the shortcut help with ?, and from the filter bar button", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("?");
    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe(
      "Keyboard shortcuts for the review queue",
    );
    pressKey("j");
    expect(activeRowKey(view)).toBeNull();
    pressKey("?");
    expect(view.query('[role="dialog"]')).toBeNull();

    await clickAsync(view.getByText("button", "Keyboard shortcuts?"));
    expect(view.query('[role="dialog"]')).not.toBeNull();
    pressKey("Escape");
    await flush();
    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("lists retranslate in the help only when spend is allowed", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    pressKey("?");
    expect(view.query('[data-shortcut="retranslate"]')).toBeNull();
    view.unmount();

    stubKeyboardReady(SPEND_SNAPSHOT);
    const spendView = await renderAsync(<ReviewPanel refreshToken={0} />);
    pressKey("?");
    expect(spendView.query('[data-shortcut="retranslate"]')).not.toBeNull();
  });

  it("offers no retranslate action or shortcut without spend", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");
    pressKey("t");
    await flush();

    expect(view.text()).not.toContain("Retranslate");
    expect(rpcCalls.some((call) => call.method === "translation.retranslateEntry")).toBe(false);
  });

  it("retranslates the highlighted row with t and reloads the queue and values", async () => {
    stubKeyboardReady(SPEND_SNAPSHOT);
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({
      "translation.retranslateEntry": {
        ok: true,
        result: { accepted: true, value: "Kasse", reviewReasons: [] },
      },
    });
    const before = rpcCalls.filter((call) => call.method === "review.queue").length;

    pressKey("j");
    pressKey("t");
    await flush();
    await flush();

    expect(rpcCalls.find((call) => call.method === "translation.retranslateEntry")?.params).toEqual(
      { locale: "de", key: "checkout.title" },
    );
    expect(rpcCalls.filter((call) => call.method === "review.queue").length).toBe(before + 1);
    expect(view.get('[role="status"]').textContent).toBe(
      "Retranslated checkout.title (de). Review the new value, then approve or reject it.",
    );
  });

  it("retranslates from the row's Retranslate button", async () => {
    stubKeyboardReady(SPEND_SNAPSHOT);
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "translation.retranslateEntry": () => new Promise(() => {}) });

    await clickAsync(rowAction(view, "cart.badge", "Retranslate"));

    expect(busyRetranslate(view, "cart.badge")).toBeDefined();
  });

  it.each([
    [
      "a protected value",
      rpcError("KEY_PROTECTED", "protected"),
      "Could not retranslate checkout.title (de): a person wrote this value. Open the key on the Translations page to replace it anyway.",
    ],
    [
      "a gate refusal",
      { ok: true, result: { accepted: false, reason: "placeholder", value: "x" } },
      "Could not retranslate checkout.title (de): Rejected: placeholder mismatch",
    ],
    [
      "a failed call",
      rpcError("PROVIDER_UNAVAILABLE", "the provider timed out"),
      "Could not retranslate checkout.title (de): the provider timed out",
    ],
  ] as const)(
    "names the reason when retranslating fails on %s, and frees the row",
    async (_case, answer, message) => {
      stubKeyboardReady(SPEND_SNAPSHOT);
      const view = await renderAsync(<ReviewPanel refreshToken={0} />);
      stubRpc({ "translation.retranslateEntry": answer });

      pressKey("j");
      pressKey("t");
      await flush();

      expect(view.get('[role="alert"]').textContent).toBe(message);
      expect((rowAction(view, "checkout.title", "Edit") as HTMLButtonElement).disabled).toBe(false);
    },
  );
});

function rowCheckbox(view: RenderResult, key: string): HTMLInputElement {
  const row = view.all("tbody tr").find((candidate) => rowKeyOf(candidate) === key);
  const box = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (box === null || box === undefined) {
    throw new Error(`no checkbox in the row for ${JSON.stringify(key)}`);
  }
  return box;
}

function selectAll(view: RenderResult): HTMLInputElement {
  return view.get('thead input[type="checkbox"]') as HTMLInputElement;
}

function bulkBar(view: RenderResult): HTMLElement | null {
  return view.query('[aria-label="Bulk actions"]');
}

function bulkButton(view: RenderResult, name: string): HTMLButtonElement {
  const bar = bulkBar(view);
  const button = [...(bar?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (candidate) => candidate.textContent === name,
  );
  if (button === undefined) {
    throw new Error(`no bulk ${name} button`);
  }
  return button;
}

describe("ReviewPanel: bulk actions", () => {
  it("keeps the bulk bar in place and counts the selection", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(bulkBar(view)?.textContent).toContain("None selected");
    await clickAsync(rowCheckbox(view, "checkout.title"));
    await clickAsync(rowCheckbox(view, "cart.badge"));

    expect(bulkBar(view)?.textContent).toContain("2 selected");
    expect(selectAll(view).indeterminate).toBe(true);
  });

  it("selects and clears every shown entry from the header checkbox", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    await clickAsync(selectAll(view));
    expect(bulkBar(view)?.textContent).toContain("3 selected");
    expect(selectAll(view).checked).toBe(true);

    await clickAsync(selectAll(view));
    expect(bulkBar(view)?.textContent).toContain("None selected");
  });

  it("counts and acts on only the selected entries the filter still shows", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(selectAll(view));

    selectOption(localeFilter(view), "fr");
    await flush();

    expect(bulkBar(view)?.textContent).toContain("1 selected");
    expect(selectAll(view).checked).toBe(true);
  });

  it("toggles the highlighted row's selection with x", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");
    pressKey("x");
    expect(rowCheckbox(view, "checkout.title").checked).toBe(true);
    pressKey("x");
    expect(rowCheckbox(view, "checkout.title").checked).toBe(false);
  });

  it("clears the selection on request", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(selectAll(view));

    await clickAsync(bulkButton(view, "Clear selection"));

    expect(bulkBar(view)?.textContent).toContain("None selected");
  });

  it("approves the selection in one call against the values on screen", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({
      "review.approveMany": {
        ok: true,
        result: {
          results: [
            { ok: true, ...decided("de", "checkout.title", "approved") },
            { ok: true, ...decided("fr", "cart.badge", "approved") },
          ],
        },
      },
      "review.queue": queueAnswer(without("checkout.title")),
    });
    await clickAsync(rowCheckbox(view, "checkout.title"));
    await clickAsync(rowCheckbox(view, "cart.badge"));

    await clickAsync(bulkButton(view, "Approve selected"));
    await flush();

    expect(rpcCalls.find((call) => call.method === "review.approveMany")?.params).toEqual({
      entries: [
        { locale: "de", key: "checkout.title", expectedValue: "Kasse" },
        { locale: "fr", key: "cart.badge", expectedValue: "Panier" },
      ],
    });
    expect(view.get('[role="status"]').textContent).toBe(
      "Approved 2 entries. The decisions are saved in verbatra.provenance.json.",
    );
    expect(bulkBar(view)?.textContent).toContain("None selected");
  });

  it("marks the selected rows busy while the batch runs", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "review.approveMany": () => new Promise(() => {}) });
    await clickAsync(rowCheckbox(view, "cart.badge"));

    await clickAsync(bulkButton(view, "Approve selected"));

    expect(rowAction(view, "cart.badge", "Approving…")).toBeDefined();
    expect((rowAction(view, "checkout.title", "Approve") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("names every entry the batch could not decide, as an alert", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({
      "review.approveMany": {
        ok: true,
        result: {
          results: [
            { ok: true, ...decided("de", "checkout.title", "approved") },
            {
              ok: false,
              locale: "fr",
              key: "cart.badge",
              code: "REVIEW_SOURCE_CHANGED",
              message: "raw",
            },
          ],
        },
      },
    });
    await clickAsync(selectAll(view));

    await clickAsync(bulkButton(view, "Approve selected"));
    await flush();

    expect(view.get('[role="alert"]').textContent).toContain(
      "Could not approve 1 entry; they stay selected.",
    );
    const failures = view.all("[data-batch-failures] li");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.textContent).toContain("The source text changed");
    expect(failures[0]?.textContent).toContain("cart.badge (fr)");
    expect(rowCheckbox(view, "cart.badge").checked).toBe(true);
    expect(rowCheckbox(view, "checkout.title").checked).toBe(false);
  });

  it("frees the rows and reports a batch the server refused outright", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({ "review.approveMany": rpcError("METHOD_RATE_LIMITED") });
    await clickAsync(rowCheckbox(view, "cart.badge"));

    await clickAsync(bulkButton(view, "Approve selected"));
    await flush();

    expect(view.get('[role="alert"]').textContent).toContain(
      "Could not approve the selected entries: Studio is limiting how often",
    );
    expect((rowAction(view, "cart.badge", "Approve") as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks a bulk approval its own recent calls have used the budget for, without sending it", async () => {
    stubKeyboardReady({
      ...SNAPSHOT,
      capabilities: {
        spend: false,
        writeToDisk: true,
        limits: {
          retranslate: { windowMs: 60_000, max: 20 },
          reviewDecision: { windowMs: 60_000, max: 1 },
        },
      },
    });
    stubRpc({
      "review.approveMany": {
        ok: true,
        result: { results: [{ ok: true, ...decided("fr", "cart.badge", "approved") }] },
      },
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowCheckbox(view, "cart.badge"));
    await clickAsync(bulkButton(view, "Approve selected"));
    await flush();
    await clickAsync(rowCheckbox(view, "checkout.title"));

    await clickAsync(bulkButton(view, "Approve selected"));
    await flush();

    expect(rpcCalls.filter((call) => call.method === "review.approveMany")).toHaveLength(1);
    expect(view.get('[role="alert"]').textContent).toMatch(
      /Could not approve the selected entries: Studio is limiting how often this action can run\. Try again in (59|60) seconds\./,
    );
    expect(rowCheckbox(view, "checkout.title").checked).toBe(true);
  });

  it("blocks a bulk retranslation larger than the whole window, without sending it", async () => {
    stubKeyboardReady({
      ...SPEND_SNAPSHOT,
      capabilities: {
        spend: true,
        writeToDisk: true,
        limits: {
          retranslate: { windowMs: 60_000, max: 1 },
          reviewDecision: { windowMs: 60_000, max: 60 },
        },
      },
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(selectAll(view));

    await clickAsync(bulkButton(view, "Retranslate selected"));
    await flush();

    expect(rpcCalls.some((call) => call.method === "translation.retranslateEntries")).toBe(false);
    expect(view.get('[role="alert"]').textContent).toContain(
      "This batch has more entries than Studio allows in one rate-limit window.",
    );
  });

  it("sends a bulk action as before when the snapshot names no limits", async () => {
    stubKeyboardReady();
    stubRpc({ "review.approveMany": rpcError("METHOD_RATE_LIMITED") });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowCheckbox(view, "cart.badge"));
    await clickAsync(bulkButton(view, "Approve selected"));
    await flush();
    await clickAsync(bulkButton(view, "Approve selected"));
    await flush();

    expect(rpcCalls.filter((call) => call.method === "review.approveMany")).toHaveLength(2);
  });

  it("holds approve and reject until the selected values have loaded", async () => {
    stubRpc({
      "review.queue": queueAnswer(QUEUE),
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "locale.values": () => new Promise(() => {}),
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowCheckbox(view, "cart.badge"));

    expect(bulkButton(view, "Approve selected").disabled).toBe(true);
    expect(bulkButton(view, "Reject selected…").disabled).toBe(true);
    expect(bulkBar(view)?.textContent).toContain(
      "Wait for the current translations to load before approving or rejecting.",
    );
  });

  it("confirms a bulk rejection first, and cancelling calls nothing", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(selectAll(view));
    const before = rpcCalls.length;

    await clickAsync(bulkButton(view, "Reject selected…"));
    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Reject 3 entries");
    pressKey("a");
    await clickAsync(view.getByText("button", "Cancel"));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rpcCalls).toHaveLength(before);
    expect(bulkBar(view)?.textContent).toContain("3 selected");
  });

  it("rejects the confirmed selection in one call and clears the selection", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    stubRpc({
      "review.rejectMany": {
        ok: true,
        result: { results: [{ ok: true, ...decided("fr", "cart.badge", "rejected") }] },
      },
      "review.queue": queueAnswer(without("cart.badge")),
    });
    await clickAsync(rowCheckbox(view, "cart.badge"));

    await clickAsync(bulkButton(view, "Reject selected…"));
    await clickAsync(view.getByText("button", "Reject and remove 1 entry"));
    await flush();

    expect(rpcCalls.find((call) => call.method === "review.rejectMany")?.params).toEqual({
      entries: [{ locale: "fr", key: "cart.badge", expectedValue: "Panier" }],
    });
    expect(rowKeys(view)).toEqual(["checkout.title", "checkout.subtitle"]);
    expect(bulkBar(view)?.textContent).toContain("None selected");
  });

  it("offers bulk retranslation only with spend, through one batch call", async () => {
    stubKeyboardReady();
    const withoutSpend = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowCheckbox(withoutSpend, "cart.badge"));
    expect(bulkBar(withoutSpend)?.textContent).not.toContain("Retranslate selected");
    withoutSpend.unmount();

    stubKeyboardReady(SPEND_SNAPSHOT);
    stubRpc({
      "translation.retranslateEntries": {
        ok: true,
        result: {
          results: [
            {
              ok: true,
              locale: "fr",
              key: "cart.badge",
              result: { accepted: true, value: "Chariot", reviewReasons: [] },
            },
          ],
        },
      },
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowCheckbox(view, "cart.badge"));

    await clickAsync(bulkButton(view, "Retranslate selected"));
    await flush();

    expect(
      rpcCalls.find((call) => call.method === "translation.retranslateEntries")?.params,
    ).toEqual({ entries: [{ locale: "fr", key: "cart.badge" }] });
    expect(view.get('[role="status"]').textContent).toBe(
      "Retranslated 1 entry. Review the new values, then approve or reject them.",
    );
  });
});

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("ReviewPanel: review workflow", () => {
  it("shows a bulk retranslation on its own button, never on Approve", async () => {
    stubKeyboardReady(SPEND_SNAPSHOT);
    stubRpc({ "translation.retranslateEntries": () => new Promise(() => {}) });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowCheckbox(view, "cart.badge"));

    await clickAsync(bulkButton(view, "Retranslate selected"));

    expect(bulkButton(view, "Retranslating…").disabled).toBe(true);
    expect(bulkButton(view, "Approve selected").disabled).toBe(true);
    expect(busyRetranslate(view, "cart.badge")).toBeDefined();
    expect(rowAction(view, "cart.badge", "Approve")).toBeDefined();
  });

  it("leaves a selected row that is retranslating out of the bulk set, and keeps Clear selection live", async () => {
    stubKeyboardReady(SPEND_SNAPSHOT);
    stubRpc({ "translation.retranslateEntry": () => new Promise(() => {}) });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowCheckbox(view, "cart.badge"));

    await clickAsync(rowAction(view, "cart.badge", "Retranslate"));

    expect(busyRetranslate(view, "cart.badge")).toBeDefined();
    expect(bulkButton(view, "Retranslate selected").disabled).toBe(true);
    expect(bulkButton(view, "Approve selected").disabled).toBe(true);
    expect(bulkButton(view, "Clear selection").disabled).toBe(false);
    expect(bulkBar(view)?.textContent).not.toContain("Retranslating…");
    expect(bulkBar(view)?.querySelector("[data-bulk-hint]")?.textContent).toBe(
      "1 selected entry is busy and is left out of bulk actions.",
    );

    await clickAsync(bulkButton(view, "Clear selection"));
    expect(bulkBar(view)?.textContent).toContain("None selected");
  });

  it("sends a bulk action only for the selected rows that are not busy", async () => {
    stubKeyboardReady(SPEND_SNAPSHOT);
    stubRpc({
      "translation.retranslateEntry": () => new Promise(() => {}),
      "review.approveMany": () => new Promise(() => {}),
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    await clickAsync(rowAction(view, "cart.badge", "Retranslate"));
    await clickAsync(selectAll(view));

    expect(bulkBar(view)?.textContent).toContain("3 selected");
    await clickAsync(bulkButton(view, "Approve selected"));

    expect(rpcCalls.find((call) => call.method === "review.approveMany")?.params).toEqual({
      entries: [
        { locale: "de", key: "checkout.title", expectedValue: "Kasse" },
        { locale: "de", key: "checkout.subtitle", expectedValue: "Bestellung prüfen" },
      ],
    });
    expect(bulkButton(view, "Approving…").disabled).toBe(true);
    expect(bulkButton(view, "Retranslate selected").disabled).toBe(true);
    expect(bulkBar(view)?.querySelector("[data-bulk-hint]")?.textContent).toBe("");
  });

  it("names the keyboard shortcuts on the highlighted row only", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");

    expect(rowAction(view, "checkout.title", "Approve").getAttribute("aria-keyshortcuts")).toBe(
      "a",
    );
    expect(rowAction(view, "cart.badge", "Approve").hasAttribute("aria-keyshortcuts")).toBe(false);
  });

  it("returns focus to the highlighted row after clearing the selection", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    pressKey("j");
    pressKey("x");

    await clickAsync(bulkButton(view, "Clear selection"));

    expect(document.activeElement?.getAttribute("aria-current")).toBe("true");
    expect(rowKeyOf(document.activeElement as Element)).toBe("checkout.title");
  });

  it("returns focus to the search field after clearing the filters", async () => {
    stubKeyboardReady();
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    typeInto(keyFilter(view), "nothing matches this");

    await clickAsync(view.getByText("button", "Clear filters"));

    expect(document.activeElement).toBe(keyFilter(view));
    expect(rowKeys(view)).toHaveLength(3);
  });

  it("focuses the translation field when the editor opens from the keyboard, and shows the row's reasons", async () => {
    stubKeyboardReady();
    stubRpc({ "key.context": { ok: true, result: KEY_VALUE } });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    pressKey("j");
    pressKey("e");
    await flush();

    expect(document.activeElement?.tagName).toBe("TEXTAREA");
    expect(view.get('[role="dialog"]').textContent).toContain("Matches source text");
  });

  it("writes an Updated notice after an editor save and focuses the next row", async () => {
    stubKeyboardReady();
    stubRpc({
      "key.context": { ok: true, result: KEY_VALUE },
      "translation.editEntry": { ok: true, result: { accepted: true, value: "Zur Kasse" } },
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    pressKey("j");
    pressKey("e");
    await flush();
    stubRpc({ "review.queue": queueAnswer(without("checkout.title")) });

    await clickAsync(view.getByText("button", "Save"));
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get("[data-decision-status]").textContent).toBe("Updated checkout.title (de).");
    expect(rowKeyOf(document.activeElement as Element)).toBe("checkout.subtitle");
  });

  it("stacks the reasons and actions under the key on a narrow screen", async () => {
    stubMatchMedia(false);
    try {
      stubKeyboardReady();
      const view = await renderAsync(<ReviewPanel refreshToken={0} />);

      expect(view.all("thead th").map((cell) => cell.textContent)).toEqual(["", "Locale", "Entry"]);
      expect(view.get("table").className.split(" ")).toContain("min-w-0");
      expect(view.get("table").className).not.toContain("480px");
      expect(view.all("[data-row-stacked]")).toHaveLength(3);
      expect(rowAction(view, "cart.badge", "Approve")).toBeDefined();
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
});

describe("ReviewPanel: retranslations the server is still running", () => {
  it("restores a running retranslation after a reload and shows how long it has run", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    try {
      vi.setSystemTime(100_000);
      stubKeyboardReady(SPEND_SNAPSHOT);
      let running = [{ locale: "fr", key: "cart.badge", elapsedMs: 5_000 }];
      stubRpc({
        "translation.inFlight": () => ({ ok: true, result: { retranslating: running } }),
      });
      const view = await renderAsync(<ReviewPanel refreshToken={0} />);
      await flush();

      expect(busyRetranslate(view, "cart.badge")).toBeDefined();
      expect((rowAction(view, "cart.badge", "Edit") as HTMLButtonElement).disabled).toBe(true);
      const status = (): string =>
        view
          .all("tbody tr")
          .find((row) => rowKeyOf(row) === "cart.badge")
          ?.querySelector('[role="status"]')?.textContent ?? "";
      expect(busyRetranslate(view, "cart.badge").textContent).toBe("Retranslating… 5s");
      expect(status()).toBe("Retranslating…");

      act(() => vi.advanceTimersByTime(1_000));
      expect(busyRetranslate(view, "cart.badge").textContent).toBe("Retranslating… 6s");
      expect(status()).toBe("Retranslating…");

      await act(async () => {
        vi.advanceTimersByTime(9_000);
      });
      await flush();
      expect(busyRetranslate(view, "cart.badge").textContent).toBe("Retranslating… 15s");
      expect(status()).toBe("Retranslating… 15 seconds so far");

      running = [];
      const queueReads = rpcCalls.filter((call) => call.method === "review.queue").length;
      await act(async () => {
        vi.advanceTimersByTime(2_000);
      });
      await flush();
      await flush();

      expect(rowAction(view, "cart.badge", "Retranslate")).toBeDefined();
      expect(rpcCalls.filter((call) => call.method === "review.queue").length).toBe(queueReads + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats an already running retranslation as progress rather than an error", async () => {
    stubKeyboardReady(SPEND_SNAPSHOT);
    let running: { locale: string; key: string; elapsedMs: number }[] = [];
    stubRpc({
      "translation.retranslateEntry": rpcError("ALREADY_IN_PROGRESS", "busy"),
      "translation.inFlight": () => ({ ok: true, result: { retranslating: running } }),
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    running = [{ locale: "fr", key: "cart.badge", elapsedMs: 0 }];

    await clickAsync(rowAction(view, "cart.badge", "Retranslate"));
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.get("[data-decision-status]").textContent).toContain(
      "cart.badge (fr) is already being retranslated",
    );
    expect(busyRetranslate(view, "cart.badge")).toBeDefined();
  });
});

const MIXED_QUEUE: ReviewQueueResult = {
  available: true,
  locales: [
    {
      locale: "de",
      needsReview: [
        { key: "checkout.title", reasons: [], provenance: MACHINE },
        {
          key: "checkout.subtitle",
          reasons: [],
          provenance: { origin: "fuzzy", reviewState: "unreviewed" },
        },
      ],
      approved: [
        {
          key: "cart.total",
          reasons: [],
          provenance: { origin: "agent", reviewState: "approved", reviewer: "mk" },
        },
      ],
    },
    { locale: "fr", needsReview: [{ key: "cart.badge", reasons: [], provenance: MACHINE }] },
  ],
};

function facetSelect(view: RenderResult, label: string): HTMLSelectElement {
  const element = view.get(`select[aria-label="${label}"]`);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`${label} is not a select element`);
  }
  return element;
}

function approveAllButton(view: RenderResult): HTMLButtonElement | null {
  const element = view.query("[data-approve-locale]");
  return element instanceof HTMLButtonElement ? element : null;
}

describe("ReviewPanel: origin and review state", () => {
  it("shows each entry's origin next to its reasons", async () => {
    stubReview(MIXED_QUEUE);

    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    expect(view.all("tbody tr")[1]?.textContent).toContain("Fuzzy match");
  });

  it("narrows the queue to one origin", async () => {
    stubReview(MIXED_QUEUE);
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    selectOption(facetSelect(view, "Filter by origin"), "fuzzy");

    expect(rowKeys(view)).toEqual(["checkout.subtitle"]);
  });

  it("lists the approved values under the Approved state, where Approve is off and Reject stays", async () => {
    stubDecisionReady();
    stubReview(MIXED_QUEUE);
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);

    selectOption(facetSelect(view, "Filter by review state"), "approved");

    expect(rowKeys(view)).toEqual(["cart.total"]);
    expect(rowAction(view, "cart.total", "Approve").hasAttribute("disabled")).toBe(true);
    expect(approveAllButton(view)).toBeNull();
  });

  it("offers to approve a whole locale once one is chosen, and saves it through review.approveLocale", async () => {
    stubReview(MIXED_QUEUE);
    stubRpc({
      "review.approveLocale": {
        ok: true,
        result: {
          locale: "de",
          approved: ["checkout.title"],
          sourceChanged: ["checkout.subtitle"],
        },
      },
    });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    expect(approveAllButton(view)).toBeNull();

    selectOption(localeFilter(view), "de");
    const button = approveAllButton(view);
    expect(button?.textContent).toBe("Approve all in de (2)…");
    await clickAsync(button as HTMLButtonElement);
    expect(view.get('[role="dialog"]').textContent).toContain(
      "Every entry of de that needs review",
    );
    await clickAsync(view.getByText("button", "Approve 2 entries"));
    await flush();

    expect(rpcCalls).toContainEqual({ method: "review.approveLocale", params: { locale: "de" } });
    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get("[data-decision-status]").textContent).toBe(
      "Approved 1 entry in de. The decisions are saved in verbatra.provenance.json. 1 entry stayed in the queue because their source changed: edit or retranslate them first.",
    );
  });

  it("approves only the chosen origin, and reports a failure", async () => {
    stubReview(MIXED_QUEUE);
    stubRpc({ "review.approveLocale": rpcError("LOCK_CONTENDED", "the locale is locked") });
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    selectOption(localeFilter(view), "de");
    selectOption(facetSelect(view, "Filter by origin"), "fuzzy");

    await clickAsync(approveAllButton(view) as HTMLButtonElement);
    expect(view.get('[role="dialog"]').textContent).toContain("written by fuzzy match");
    await clickAsync(view.getByText("button", "Approve 1 entry"));
    await flush();

    expect(rpcCalls).toContainEqual({
      method: "review.approveLocale",
      params: { locale: "de", origins: ["fuzzy"] },
    });
    expect(view.get("[data-decision-status]").textContent).toBe(
      "Could not approve the entries in de: the locale is locked",
    );
  });

  it("closes the approve-all dialog on Cancel without saving anything", async () => {
    stubReview(MIXED_QUEUE);
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    selectOption(localeFilter(view), "de");

    await clickAsync(approveAllButton(view) as HTMLButtonElement);
    await clickAsync(view.getByText("button", "Cancel"));

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(rpcCalls.map((call) => call.method)).not.toContain("review.approveLocale");
  });

  it("clears every facet with Clear filters", async () => {
    stubReview(MIXED_QUEUE);
    const view = await renderAsync(<ReviewPanel refreshToken={0} />);
    selectOption(facetSelect(view, "Filter by origin"), "agent");
    expect(rowKeys(view)).toEqual([]);

    await clickAsync(view.getByText("button", "Clear filters"));

    expect(rowKeys(view)).toEqual(["checkout.title", "checkout.subtitle", "cart.badge"]);
  });
});
