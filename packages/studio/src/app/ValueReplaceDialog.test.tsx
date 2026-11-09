// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  click,
  clickAsync,
  flush,
  pressKey,
  render,
  rpcCalls,
  rpcError,
  stubRpc,
  typeInto,
} from "./test-support.js";
import { ValueReplaceDialog } from "./ValueReplaceDialog.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const COUNTS = {
  ready: 0,
  "stale-source": 0,
  "gate-refused": 0,
  pinned: 0,
  protected: 0,
  "no-source-entry": 0,
  unchanged: 0,
  "too-long": 0,
};

function entry(key: string, status: string, extra: object = {}): object {
  return {
    locale: "de",
    key,
    status,
    valueHash: `hash-${key}`,
    before: `Hallo Welt ${key}`,
    after: `Hallo Erde ${key}`,
    excerptCut: false,
    ...extra,
  };
}

function previewResult(entries: object[], extra: object = {}): StubResult {
  const counts: Record<string, number> = { ...COUNTS };
  for (const item of entries) {
    const status = (item as { status: string }).status;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return { ok: true, result: { entries, truncated: false, counts, ...extra } };
}

type StubResult = { ok: true; result: unknown };

function mount(): ReturnType<typeof render> {
  return render(<ValueReplaceDialog locales={["de", "fr"]} onClose={vi.fn()} />);
}

async function search(
  view: ReturnType<typeof render>,
  find = "Welt",
  replace = "Erde",
): Promise<void> {
  typeInto(view.get("[data-replace-find]") as HTMLInputElement, find);
  typeInto(view.get("[data-replace-with]") as HTMLInputElement, replace);
  await clickAsync(view.getByText("button", "Preview"));
  await flush();
}

function applyCalls(): { params: Record<string, unknown> }[] {
  return rpcCalls
    .filter((call) => call.method === "translation.applyValueReplace")
    .map((call) => ({ params: call.params as Record<string, unknown> }));
}

describe("ValueReplaceDialog criteria step", () => {
  it("sends the criteria without a locale list when every locale is chosen", async () => {
    rpcCalls.length = 0;
    stubRpc({ "translation.previewValueReplace": previewResult([]) });
    const view = mount();

    await search(view, "Welt", "$&");

    expect(rpcCalls.at(-1)).toEqual({
      method: "translation.previewValueReplace",
      params: { find: "Welt", replace: "$&", caseSensitive: true },
    });
  });

  it("names the chosen locales and the case option, and sends nothing for an empty find", async () => {
    rpcCalls.length = 0;
    stubRpc({ "translation.previewValueReplace": previewResult([]) });
    const view = mount();

    await clickAsync(view.getByText("button", "Preview"));
    expect(rpcCalls).toHaveLength(0);

    click(view.get('[data-replace-locale="fr"]'));
    click(view.get("[data-replace-case]"));
    await search(view);

    expect(rpcCalls.at(-1)?.params).toEqual({
      find: "Welt",
      replace: "Erde",
      caseSensitive: false,
      locales: ["de"],
    });
  });

  it("keeps Preview inert with no locale chosen, and toggles a locale back on", async () => {
    rpcCalls.length = 0;
    const view = mount();
    click(view.get('[data-replace-locale="de"]'));
    click(view.get('[data-replace-locale="fr"]'));
    typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");

    await clickAsync(view.getByText("button", "Preview"));
    expect(rpcCalls).toHaveLength(0);

    click(view.get('[data-replace-locale="fr"]'));
    expect((view.get('[data-replace-locale="fr"]') as HTMLInputElement).checked).toBe(true);
  });

  it("shows FIND_TEXT_INVALID at the find field, not as a page alert", async () => {
    stubRpc({
      "translation.previewValueReplace": rpcError(
        "FIND_TEXT_INVALID",
        "The find text must be 1 to 20000 characters, got 20001.",
      ),
    });
    const view = mount();

    await search(view, "x".repeat(5));

    const find = view.get("[data-replace-find]");
    expect(find.getAttribute("aria-invalid")).toBe("true");
    expect(find.getAttribute("aria-describedby")).toBeTruthy();
    expect(view.text()).toContain("The find text must be 1 to 20000 characters");
    expect(view.query('[role="alert"]')).toBeNull();
    expect((find as HTMLInputElement).value).toBe("xxxxx");
  });

  it("shows FIND_TEXT_INVALID for the replace text at the replace field only", async () => {
    stubRpc({
      "translation.previewValueReplace": rpcError(
        "FIND_TEXT_INVALID",
        "The replace text must not contain an unpaired surrogate code unit.",
      ),
    });
    const view = mount();

    await search(view, "Welt", "x");

    expect(view.get("[data-replace-with]").getAttribute("aria-invalid")).toBe("true");
    expect(view.get("[data-replace-find]").getAttribute("aria-invalid")).toBeNull();
    expect(view.text()).toContain("The replace text must not contain");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("shows any other preview failure as an alert and keeps the typed text", async () => {
    stubRpc({ "translation.previewValueReplace": rpcError("METHOD_RATE_LIMITED") });
    const view = mount();

    await search(view);

    expect(view.get('[role="alert"]')).toBeDefined();
    expect((view.get("[data-replace-find]") as HTMLInputElement).value).toBe("Welt");
  });
});

describe("ValueReplaceDialog review step", () => {
  const MIXED = [
    entry("ready.key", "ready"),
    entry("stale.key", "stale-source"),
    entry("pinned.key", "pinned"),
    entry("protected.key", "protected"),
    entry("refused.key", "gate-refused", {
      reason: "placeholder",
      details: ["{name} is missing"],
    }),
    entry("long.key", "too-long", { after: "" }),
  ];

  it("lists locale, status and excerpts per entry, with counts and the stale-source statement", async () => {
    stubRpc({ "translation.previewValueReplace": previewResult(MIXED) });
    const view = mount();
    await search(view);

    const rows = view.all("[data-replace-entry]");
    expect(rows.map((row) => row.getAttribute("data-status"))).toEqual([
      "ready",
      "stale-source",
      "pinned",
      "protected",
      "gate-refused",
      "too-long",
    ]);
    expect(rows[0]?.textContent).toContain("de");
    expect(rows[0]?.textContent).toContain("Hallo Welt ready.key");
    expect(rows[0]?.textContent).toContain("Hallo Erde ready.key");
    expect(view.get("[data-replace-counts]").textContent).toContain("Ready: 1");
    expect(view.get("[data-replace-counts]").textContent).toContain("Protected value: 1");
    expect(view.get("[data-replace-reason]").textContent).toContain("a placeholder would change");
    expect(view.get("[data-replace-reason]").textContent).toContain("{name} is missing");
    expect(view.get("[data-replace-stale-note]").textContent).toContain("current source text");
    expect(rows[5]?.textContent).not.toContain("After");
  });

  it("starts with both opt-ins off, shows their counts, and sends only ready and stale keys", async () => {
    rpcCalls.length = 0;
    stubRpc({
      "translation.previewValueReplace": previewResult(MIXED),
      "translation.applyValueReplace": {
        ok: true,
        result: { outcomes: [], counts: {}, localeFailures: [] },
      },
    });
    const view = mount();
    await search(view);

    const pinned = view.get('[data-replace-optin="pinned"]') as HTMLInputElement;
    const protectedBox = view.get('[data-replace-optin="protected"]') as HTMLInputElement;
    expect(pinned.checked).toBe(false);
    expect(protectedBox.checked).toBe(false);
    expect(view.get("[data-replace-optins]").textContent).toContain("(1)");
    expect(view.get("[data-replace-apply]").textContent).toBe("Replace 2 values");

    await clickAsync(view.get("[data-replace-apply]"));

    const [call] = applyCalls();
    const sent = (call?.params.entries ?? []) as { key: string }[];
    expect(sent.map((item) => item.key)).toEqual(["ready.key", "stale.key"]);
    expect(call?.params.includePinned).toBeUndefined();
    expect(call?.params.includeProtected).toBeUndefined();
    expect(call?.params).not.toHaveProperty("actor");
  });

  it("adds pinned and protected keys with their flags when opted in, and counts them on the button", async () => {
    rpcCalls.length = 0;
    stubRpc({
      "translation.previewValueReplace": previewResult(MIXED),
      "translation.applyValueReplace": {
        ok: true,
        result: { outcomes: [], counts: {}, localeFailures: [] },
      },
    });
    const view = mount();
    await search(view);

    click(view.get('[data-replace-optin="pinned"]'));
    click(view.get('[data-replace-optin="protected"]'));
    expect(view.get("[data-replace-apply]").textContent).toBe("Replace 4 values");
    await clickAsync(view.get("[data-replace-apply]"));

    const [call] = applyCalls();
    expect(call?.params.includePinned).toBe(true);
    expect(call?.params.includeProtected).toBe(true);
    expect(call?.params.find).toBe("Welt");
    expect(call?.params.replace).toBe("Erde");
  });

  it("applies the criteria that were previewed, not text typed afterwards", async () => {
    rpcCalls.length = 0;
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")]),
      "translation.applyValueReplace": {
        ok: true,
        result: { outcomes: [], counts: {}, localeFailures: [] },
      },
    });
    const view = mount();
    await search(view, "Welt", "Erde");

    await clickAsync(view.get("[data-replace-apply]"));

    expect(applyCalls()[0]?.params.find).toBe("Welt");
  });

  it("does not remember the opt-ins after going back and searching again", async () => {
    stubRpc({ "translation.previewValueReplace": previewResult(MIXED) });
    const view = mount();
    await search(view);
    click(view.get('[data-replace-optin="protected"]'));

    await clickAsync(view.getByText("button", "Back"));
    expect((view.get("[data-replace-find]") as HTMLInputElement).value).toBe("Welt");
    await clickAsync(view.getByText("button", "Preview"));
    await flush();

    expect((view.get('[data-replace-optin="protected"]') as HTMLInputElement).checked).toBe(false);
  });

  it("keeps Replace inert when nothing can be sent", async () => {
    rpcCalls.length = 0;
    stubRpc({ "translation.previewValueReplace": previewResult([entry("p", "pinned")]) });
    const view = mount();
    await search(view);

    await clickAsync(view.get("[data-replace-apply]"));

    expect(view.get("[data-replace-apply]").textContent).toBe("Replace 0 values");
    expect(applyCalls()).toHaveLength(0);
  });

  it("says so when nothing matches", async () => {
    stubRpc({ "translation.previewValueReplace": previewResult([]) });
    const view = mount();
    await search(view);

    expect(view.get("[data-replace-empty]")).toBeDefined();
  });

  it("states the 1,000 cap and an unreadable lock file", async () => {
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")], {
        truncated: true,
        baselineUnavailable: true,
      }),
    });
    const view = mount();
    await search(view);

    expect(view.get("[data-replace-truncated]").textContent).toContain("1,000");
    expect(view.get("[data-replace-baseline]").textContent).toContain("verbatra.lock.json");
  });

  it("shows 50 entries and reveals more on request", async () => {
    const many = Array.from({ length: 60 }, (_, index) => entry(`k${index}`, "ready"));
    stubRpc({ "translation.previewValueReplace": previewResult(many) });
    const view = mount();
    await search(view);

    expect(view.all("[data-replace-entry]")).toHaveLength(50);
    await clickAsync(view.getByText("button", "Show 10 more"));
    expect(view.all("[data-replace-entry]")).toHaveLength(60);
  });

  it("renders values as text with a direction and language, wraps long tokens, never as HTML", async () => {
    const hostile = `<img src=x onerror=alert(1)> \u202Ebidi\u202C ${"A".repeat(300)}`;
    stubRpc({
      "translation.previewValueReplace": previewResult([
        entry("k", "ready", {
          locale: "ar",
          before: "سلة {count}",
          after: hostile,
          excerptCut: true,
        }),
      ]),
    });
    const view = mount();
    await search(view);

    const row = view.get("[data-replace-entry]");
    expect(row.querySelector("img")).toBeNull();
    expect(row.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(row.querySelector('[dir="rtl"][lang="ar"]')?.textContent).toBe("سلة {count}");
    expect(row.querySelector("[style]")).toBeNull();
    expect(row.innerHTML).toContain("wrap-anywhere");
    expect(row.textContent).toContain("Shortened to the first match.");
  });

  it("shows an apply failure under the list and lets the user retry", async () => {
    let calls = 0;
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")]),
      "translation.applyValueReplace": () => {
        calls += 1;
        return calls === 1
          ? rpcError("METHOD_RATE_LIMITED")
          : { ok: true, result: { outcomes: [], counts: {}, localeFailures: [] } };
      },
    });
    const view = mount();
    await search(view);

    await clickAsync(view.get("[data-replace-apply]"));
    expect(view.get('[role="alert"]')).toBeDefined();
    expect(view.query("[data-replace-step='review']")).not.toBeNull();

    await clickAsync(view.get("[data-replace-apply]"));
    expect(view.query("[data-replace-step='result']")).not.toBeNull();
  });

  it("ignores Escape while the apply is running and closes otherwise", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onClose = vi.fn();
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")]),
      "translation.applyValueReplace": async () => {
        await held;
        return { ok: true, result: { outcomes: [], counts: {}, localeFailures: [] } };
      },
    });
    const view = render(<ValueReplaceDialog locales={["de"]} onClose={onClose} />);
    await search(view);
    click(view.get("[data-replace-apply]"));
    await flush();

    pressKey("Escape");
    click(view.get("[data-replace-apply]"));
    expect(onClose).not.toHaveBeenCalled();
    expect(view.get("[data-replace-apply]").textContent).toBe("Replacing…");
    expect(applyCalls()).toHaveLength(1);

    release();
    await flush();
    pressKey("Escape");
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ValueReplaceDialog result step", () => {
  it("shows a per-entry result with every outcome kind and the locale failures", async () => {
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")]),
      "translation.applyValueReplace": {
        ok: true,
        result: {
          outcomes: [
            { locale: "de", key: "a", status: "applied", staleSource: true },
            { locale: "de", key: "b", status: "changed" },
            { locale: "de", key: "c", status: "too-long" },
            { locale: "de", key: "d", status: "refused", reason: "icu", details: ["arm one"] },
            { locale: "fr", key: "e", status: "skipped", reason: "locale-failed" },
          ],
          counts: {},
          localeFailures: [
            { locale: "fr", code: "LOCK_CONTENDED", message: "held" },
            { locale: "es", code: "LOCALE_FAILED", message: "late", fileWritten: true },
          ],
        },
      },
    });
    const view = mount();
    await search(view);
    await clickAsync(view.get("[data-replace-apply]"));

    const text = view.get("[data-replace-outcomes]").textContent ?? "";
    expect(view.get("[data-replace-summary]").textContent).toBe("1 of 5 values replaced.");
    expect(text).toContain("Replaced, still out of date");
    expect(text).toContain("the value changed since the preview");
    expect(text).toContain("over 20,000 characters");
    expect(text).toContain("the message syntax would break");
    expect(text).toContain("arm one");
    expect(text).toContain("Not attempted: the locale failed");
    expect(view.get('[data-replace-failure="fr"]').textContent).toContain("LOCK_CONTENDED");
  });

  it("says the values are on disk only for the locale that reports fileWritten", async () => {
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")]),
      "translation.applyValueReplace": {
        ok: true,
        result: {
          outcomes: [],
          counts: {},
          localeFailures: [
            { locale: "fr", code: "LOCK_CONTENDED", message: "held" },
            { locale: "es", code: "LOCALE_FAILED", message: "late", fileWritten: true },
          ],
        },
      },
    });
    const view = mount();
    await search(view);
    await clickAsync(view.get("[data-replace-apply]"));

    expect(
      view.get('[data-replace-failure="fr"]').querySelector("[data-replace-file-written]"),
    ).toBeNull();
    expect(
      view.get('[data-replace-failure="es"] [data-replace-file-written]').textContent,
    ).toContain("already saved");
    expect(view.get('[data-replace-failure="es"]').textContent).toContain("review the locale");
  });

  it("pages a long result, and Search again returns to the criteria with the typed text", async () => {
    const outcomes = Array.from({ length: 55 }, (_, index) => ({
      locale: "de",
      key: `k${index}`,
      status: "applied",
      staleSource: false,
    }));
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")]),
      "translation.applyValueReplace": {
        ok: true,
        result: { outcomes, counts: {}, localeFailures: [] },
      },
    });
    const view = mount();
    await search(view);
    await clickAsync(view.get("[data-replace-apply]"));

    expect(view.all("[data-replace-outcome]")).toHaveLength(50);
    await clickAsync(view.getByText("button", "Show 5 more"));
    expect(view.all("[data-replace-outcome]")).toHaveLength(55);

    await clickAsync(view.getByText("button", "Search again"));
    expect((view.get("[data-replace-with]") as HTMLInputElement).value).toBe("Erde");
  });

  it("closes from Done", async () => {
    const onClose = vi.fn();
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")]),
      "translation.applyValueReplace": {
        ok: true,
        result: { outcomes: [], counts: {}, localeFailures: [] },
      },
    });
    const view = render(<ValueReplaceDialog locales={["de"]} onClose={onClose} />);
    await search(view);
    await clickAsync(view.get("[data-replace-apply]"));

    click(view.get("[data-replace-done]"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
