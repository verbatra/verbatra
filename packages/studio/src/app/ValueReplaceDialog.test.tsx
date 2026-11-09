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
    expect(view.text()).toContain("The find text must be 1 to 20,000 characters, got 20,001");
    const note = view.get("[data-field-note][role='alert']");
    expect(note.id).toBe(find.getAttribute("aria-describedby"));
    expect(view.all('[role="alert"]')).toHaveLength(1);
    expect((find as HTMLInputElement).value).toBe("xxxxx");
    expect(document.activeElement).toBe(find);
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
    expect(view.all('[role="alert"]')).toHaveLength(1);
    expect(document.activeElement).toBe(view.get("[data-replace-with]"));
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
    expect(view.get("[data-replace-counts]").textContent).toContain("Protected: 1");
    expect(rows[3]?.querySelector("[data-replace-note]")?.textContent).toContain(
      "outside verbatra",
    );
    expect(view.get("[data-replace-reason]").textContent).toContain("a placeholder would change");
    const detail = view.get("[data-replace-reason] [data-replace-detail]");
    expect(detail.textContent).toBe("{name} is missing");
    expect(detail.getAttribute("lang")).toBe("de");
    expect(detail.getAttribute("dir")).toBe("ltr");
    expect(detail.querySelector("bdi[data-value-token]")?.textContent).toBe("{name}");
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

    expect(view.get("[data-replace-lead]").textContent).toContain("No translation contains");
    expect(view.query("[data-replace-stale-note]")).toBeNull();
    expect(view.query("[data-replace-optins]")).toBeNull();
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
    expect(text).toContain("Still out of date");
    expect(text).toContain("changed since the preview");
    expect(text).toContain("over 20,000 characters");
    expect(text).toContain("the message syntax would break");
    expect(view.get("[data-replace-outcomes] [data-replace-detail]").textContent).toBe("arm one");
    expect(text).toContain("Not attempted");
    expect(
      view.all("[data-replace-outcome] [data-tone='warning']").map((badge) => badge.textContent),
    ).toContain("Replaced");
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

describe("ValueReplaceDialog focus and announcements", () => {
  it("opens on the Find field and moves focus into each new step", async () => {
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")]),
      "translation.applyValueReplace": {
        ok: true,
        result: { outcomes: [], counts: {}, localeFailures: [] },
      },
    });
    const view = mount();
    expect(document.activeElement).toBe(view.get("[data-replace-find]"));

    await search(view);
    expect(document.activeElement).toBe(view.get("[data-replace-lead]"));
    expect(view.get("[data-replace-lead]").getAttribute("role")).toBe("status");
    expect(view.get("[data-replace-lead]").textContent).toBe("1 value match.");

    await clickAsync(view.get("[data-replace-apply]"));
    expect(document.activeElement).toBe(view.get("[data-replace-lead]"));
    expect(view.get("[data-replace-lead]").textContent).toContain("replaced");

    await clickAsync(view.getByText("button", "Search again"));
    expect(document.activeElement).toBe(view.get("[data-replace-find]"));
  });
});

describe("ValueReplaceDialog criteria validation", () => {
  it("answers Preview with no find text at the Find field and sends nothing", async () => {
    rpcCalls.length = 0;
    const view = mount();

    await clickAsync(view.getByText("button", "Preview"));

    const find = view.get("[data-replace-find]");
    expect(find.getAttribute("aria-invalid")).toBe("true");
    expect(view.get("[data-field-note][role='alert']").textContent).toBe("Enter the text to find.");
    expect(document.activeElement).toBe(find);
    expect(rpcCalls).toHaveLength(0);

    typeInto(find as HTMLInputElement, "x");
    expect(view.query("[data-field-note][role='alert']")).toBeNull();
  });

  it("answers Preview with no locale chosen at the locale list and sends nothing", async () => {
    rpcCalls.length = 0;
    const view = mount();
    click(view.get('[data-replace-locale="de"]'));
    click(view.get('[data-replace-locale="fr"]'));
    typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");

    await clickAsync(view.getByText("button", "Preview"));

    expect(view.get("#replace-locales-note").textContent).toBe(
      "Choose at least one locale to search.",
    );
    expect(view.get("[data-replace-locales]").getAttribute("aria-describedby")).toBe(
      "replace-locales-note",
    );
    expect(document.activeElement).toBe(view.get('[data-replace-locale="de"]'));
    expect(rpcCalls).toHaveLength(0);
  });

  it("makes each checkbox row one label, so the whole row is the click target", () => {
    const view = mount();

    const row = view.get('[data-replace-locale="de"]').closest("label");
    expect(row?.getAttribute("data-replace-check-row")).toBe("");
    expect(row?.className).toContain("max-md:min-h-11");
    click(row?.querySelector("span.min-w-0") as HTMLElement);
    expect((view.get('[data-replace-locale="de"]') as HTMLInputElement).checked).toBe(false);
  });

  it("keeps Cancel from closing the dialog while the search runs", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onClose = vi.fn();
    stubRpc({
      "translation.previewValueReplace": async () => {
        await held;
        return previewResult([]);
      },
    });
    const view = render(<ValueReplaceDialog locales={["de"]} onClose={onClose} />);
    typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");
    click(view.getByText("button", "Preview"));
    await flush();

    click(view.getByText("button", "Cancel"));
    expect(onClose).not.toHaveBeenCalled();

    release();
    await flush();
    click(view.getByText("button", "Back"));
    click(view.getByText("button", "Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ValueReplaceDialog review details", () => {
  it("disables Replace for real when nothing can be sent, and says why", async () => {
    stubRpc({ "translation.previewValueReplace": previewResult([entry("p", "pinned")]) });
    const view = mount();
    await search(view);

    const apply = view.get("[data-replace-apply]") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(view.get("[data-replace-nothing]").textContent).toContain("Nothing can be replaced");
  });

  it("hides an opt-in whose count is zero, and the stale note when no key is stale", async () => {
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready"), entry("p", "pinned")]),
    });
    const view = mount();
    await search(view);

    expect(view.query('[data-replace-optin="protected"]')).toBeNull();
    expect(view.query('[data-replace-optin="pinned"]')).not.toBeNull();
    expect(view.query("[data-replace-stale-note]")).toBeNull();
  });

  it("shows a short status word in the badge and the explanation as text", async () => {
    stubRpc({ "translation.previewValueReplace": previewResult([entry("s", "stale-source")]) });
    const view = mount();
    await search(view);

    const row = view.get("[data-replace-entry]");
    expect(row.querySelector("[data-tone='warning']")?.textContent).toBe("Source changed");
    expect(row.querySelector("[data-replace-note]")?.textContent).toContain("stays out of date");
  });

  it("wraps a long excerpt token and isolates a placeholder token", async () => {
    const long = `{count} ${"A".repeat(300)}`;
    stubRpc({
      "translation.previewValueReplace": previewResult([
        entry("k", "ready", { before: long, after: long }),
      ]),
    });
    const view = mount();
    await search(view);

    const excerpt = view.get('[data-replace-excerpt="now"]');
    expect(excerpt.className).toContain("wrap-anywhere");
    expect(excerpt.className).toContain("whitespace-pre-wrap");
    const token = excerpt.querySelector("bdi[data-value-token]");
    expect(token?.textContent).toBe("{count}");
    expect(token?.getAttribute("dir")).toBe("ltr");
    expect(excerpt.textContent).toContain("A".repeat(300));
  });
});

describe("ValueReplaceDialog result accounting", () => {
  it("lists every previewed entry that was not sent, with its status, and counts them", async () => {
    stubRpc({
      "translation.previewValueReplace": previewResult([
        entry("ready", "ready"),
        entry("pinned", "pinned"),
        entry("protected", "protected"),
        entry("refused", "gate-refused"),
        entry("same", "unchanged"),
      ]),
      "translation.applyValueReplace": {
        ok: true,
        result: {
          outcomes: [{ locale: "de", key: "ready", status: "applied", staleSource: false }],
          counts: {},
          localeFailures: [],
        },
      },
    });
    const view = mount();
    await search(view);
    await clickAsync(view.get("[data-replace-apply]"));

    expect(view.get("[data-replace-accounting]").textContent).toContain(
      "The preview listed 5 values; 4 were not sent.",
    );
    const keys = view
      .all("[data-replace-not-sent-entry]")
      .map((row) => row.querySelector("span[dir=ltr]")?.textContent);
    expect(keys).toEqual(["pinned", "protected", "refused", "same"]);
    expect(view.get("[data-replace-not-sent] h3").textContent).toBe("Not sent (4)");
    expect(view.get("[data-replace-not-sent]").textContent).toContain("Pinned");
  });

  it("omits the section when everything was sent, and repeats the 1,000 cap notice", async () => {
    stubRpc({
      "translation.previewValueReplace": previewResult([entry("a", "ready")], {
        truncated: true,
      }),
      "translation.applyValueReplace": {
        ok: true,
        result: {
          outcomes: [{ locale: "de", key: "a", status: "applied", staleSource: false }],
          counts: {},
          localeFailures: [],
        },
      },
    });
    const view = mount();
    await search(view);
    await clickAsync(view.get("[data-replace-apply]"));

    expect(view.query("[data-replace-not-sent]")).toBeNull();
    expect(view.query("[data-replace-accounting]")).toBeNull();
    expect(view.get("[data-replace-truncated]").textContent).toContain("1,000");
  });
});
