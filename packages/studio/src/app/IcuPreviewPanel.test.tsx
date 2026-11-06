// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ICU_PREVIEW_DELAY_MS } from "../client/icu-preview.js";
import { IcuPreviewPanel } from "./IcuPreviewPanel.js";
import { icuPreviewOpenStore } from "./icu-preview-open.js";
import {
  buttonNamed,
  click,
  deferredAnswer,
  flush,
  type RenderResult,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  type StubRpcResult,
  stubRpc,
  textboxNamed,
  typeInto,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const SNAPSHOT_ICU: StubRpcResult = { ok: true, result: { format: "next-intl-json" } };

interface Row {
  readonly axis?: string;
  readonly argument?: string | null;
  readonly category?: string | null;
  readonly sample?: string | number | null;
  readonly text: string;
}

function validAnswer(
  rows: readonly Row[],
  extra: { readonly truncated?: boolean; readonly named?: readonly unknown[] } = {},
): StubRpcResult {
  return {
    ok: true,
    result: {
      supported: true,
      valid: true,
      arguments:
        extra.named === undefined ? { style: "none" } : { style: "named", named: extra.named },
      truncated: extra.truncated ?? false,
      rows: rows.map((row) => ({
        axis: row.axis ?? "plural",
        argument: row.argument === undefined ? "n" : row.argument,
        category: row.category === undefined ? "other" : row.category,
        sample: row.sample === undefined ? 5 : row.sample,
        segments: [{ kind: "text", text: row.text }],
      })),
    },
  };
}

function refusal(reason: string): StubRpcResult {
  return { ok: true, result: { supported: true, valid: false, reason } };
}

function previewCalls(): readonly { readonly params: Record<string, unknown> }[] {
  return rpcCalls.filter((call) => call.method === "key.previewIcu") as never;
}

async function settle(ms = ICU_PREVIEW_DELAY_MS): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function panel(value: string, locale = "de"): ReactElement {
  return <IcuPreviewPanel locale={locale} value={value} />;
}

async function openPanel(view: RenderResult): Promise<void> {
  click(buttonNamed(view, "ICU preview"));
  await settle();
}

function rowsOf(view: RenderResult): HTMLElement[] {
  return view.all("[data-icu-row]");
}

beforeEach(() => {
  vi.useFakeTimers();
  icuPreviewOpenStore.setOpen(false);
});

afterEach(() => {
  vi.useRealTimers();
  icuPreviewOpenStore.setOpen(false);
});

describe("IcuPreviewPanel visibility", () => {
  it("renders nothing for a format without ICU syntax and never asks for a preview", async () => {
    stubRpc({ "project.snapshot": { ok: true, result: { format: "i18next-json" } } });

    const view = await renderAsync(panel("Hi"));

    expect(view.container.innerHTML).toBe("");
    expect(previewCalls()).toHaveLength(0);
  });

  it.each([
    ["while the project is still loading", () => new Promise<StubRpcResult>(() => {})],
    ["when the project cannot be read", () => rpcError("INTERNAL")],
  ])("renders nothing %s", async (_name, answer) => {
    stubRpc({ "project.snapshot": answer });

    const view = await renderAsync(panel("Hi"));

    expect(view.container.innerHTML).toBe("");
  });

  it("is closed by default, named by a button, and reads nothing until opened", async () => {
    stubRpc({ "project.snapshot": SNAPSHOT_ICU });

    const view = await renderAsync(panel("Hi"));
    await settle(2000);

    const toggle = buttonNamed(view, "ICU preview");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(view.query("[data-recovery-target]")).toBeNull();
    expect(previewCalls()).toHaveLength(0);
  });

  it("opens and closes only through its button, and remembers the choice for the session", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([
        { axis: "none", argument: null, category: null, sample: null, text: "Hi" },
      ]),
    });
    const first = await renderAsync(panel("Hi"));

    await openPanel(first);
    const toggle = buttonNamed(first, "ICU preview");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(first.get("section > div").id);
    first.unmount();

    const second = await renderAsync(panel("Hi"));
    expect(buttonNamed(second, "ICU preview").getAttribute("aria-expanded")).toBe("true");

    click(buttonNamed(second, "ICU preview"));
    expect(buttonNamed(second, "ICU preview").getAttribute("aria-expanded")).toBe("false");
    expect(second.query("[data-icu-rows]")).toBeNull();
  });

  it("shows the machine caveat and gives nothing a title or a tooltip", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([{ text: "x" }]),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.text()).toContain(
      "Rendered with this machine's Node CLDR data, not your app's runtime.",
    );
    expect(view.all("[title], [role='tooltip']")).toHaveLength(0);
  });
});

describe("IcuPreviewPanel reads", () => {
  it("waits for the typing to pause and sends only the last draft", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([{ text: "x" }]),
    });
    const view = await renderAsync(panel("a"));
    await openPanel(view);
    const before = previewCalls().length;

    view.rerender(panel("ab"));
    await settle(100);
    view.rerender(panel("abc"));
    await settle(100);
    view.rerender(panel("abcd"));
    await settle();

    const sent = previewCalls().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.params).toEqual({ locale: "de", value: "abcd" });
  });

  it("reads the current draft, locale and no args when nothing is sampled", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([{ text: "x" }]),
    });
    const view = await renderAsync(panel("{n, plural, one {# a} other {# b}}", "pl"));

    await openPanel(view);

    expect(previewCalls()[0]?.params).toEqual({
      locale: "pl",
      value: "{n, plural, one {# a} other {# b}}",
    });
  });

  it("never lets a slow answer for an older draft replace the answer for the newer one", async () => {
    const older = deferredAnswer();
    const newer = deferredAnswer();
    const queue = [older, newer];
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": () => queue.shift()?.promise ?? validAnswer([]),
    });
    const view = await renderAsync(panel("old"));
    await openPanel(view);

    view.rerender(panel("new"));
    await settle();
    newer.resolve(validAnswer([{ text: "NEWER" }]));
    await flush();
    older.resolve(validAnswer([{ text: "OLDER" }]));
    await flush();

    expect(rowsOf(view).map((row) => row.textContent)).toEqual([expect.stringContaining("NEWER")]);
    expect(view.text()).not.toContain("OLDER");
  });

  it("keeps the last rows and says it is updating while a newer read is pending", async () => {
    const slow = deferredAnswer();
    const answers: (StubRpcResult | Promise<StubRpcResult>)[] = [
      validAnswer([{ text: "FIRST" }]),
      slow.promise,
    ];
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": () => answers.shift() ?? validAnswer([]),
    });
    const view = await renderAsync(panel("one"));
    await openPanel(view);
    expect(view.get("[data-icu-status]").textContent).toBe("");

    view.rerender(panel("two"));
    await settle();

    expect(view.get("[data-icu-status]").textContent).toBe("Updating…");
    expect(rowsOf(view)[0]?.textContent).toContain("FIRST");
    expect(view.get("[data-icu-status]").className).toContain("min-h-5");
  });

  it("drops an answer that arrives after the panel is closed", async () => {
    const slow = deferredAnswer();
    stubRpc({ "project.snapshot": SNAPSHOT_ICU, "key.previewIcu": () => slow.promise });
    const view = await renderAsync(panel("one"));
    await openPanel(view);

    click(buttonNamed(view, "ICU preview"));
    slow.resolve(validAnswer([{ text: "LATE" }]));
    await flush();

    expect(view.text()).not.toContain("LATE");
  });

  it("does not ask again for a value over the boundary cap and says it is too long", async () => {
    stubRpc({ "project.snapshot": SNAPSHOT_ICU, "key.previewIcu": validAnswer([{ text: "x" }]) });
    const view = await renderAsync(panel("x".repeat(20_001)));

    await openPanel(view);

    expect(previewCalls()).toHaveLength(0);
    expect(view.get("[data-icu-refusal]").getAttribute("data-icu-refusal")).toBe("too-long");
  });

  it("hides itself and stops reading when the server says the format has no ICU", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": { ok: true, result: { supported: false, reason: "not-icu" } },
    });
    const view = await renderAsync(panel("a"));
    await openPanel(view);
    const calls = previewCalls().length;

    view.rerender(panel("ab"));
    await settle();

    expect(view.container.innerHTML).toBe("");
    expect(previewCalls()).toHaveLength(calls);
  });
});

describe("IcuPreviewPanel rows", () => {
  it("shows one row per Polish plural category, in the order given", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([
        { category: "one", sample: 1, text: "1 plik" },
        { category: "few", sample: 2, text: "2 pliki" },
        { category: "many", sample: 5, text: "5 plikow" },
        { category: "other", sample: 1.5, text: "1.5 pliku" },
      ]),
    });
    const view = await renderAsync(panel("x", "pl"));

    await openPanel(view);

    const rows = rowsOf(view);
    expect(rows.map((row) => row.getAttribute("data-category"))).toEqual([
      "one",
      "few",
      "many",
      "other",
    ]);
    expect(rows.every((row) => row.getAttribute("data-argument") === "n")).toBe(true);
    expect(rows[1]?.textContent).toContain("= 2");
    expect(rows[1]?.querySelector("[data-icu-text]")?.getAttribute("lang")).toBe("pl");
  });

  it("repeats a category when the same arm appears in several places", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([
        { category: "one", sample: 1, text: "A" },
        { category: "one", sample: 1, text: "B" },
      ]),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(rowsOf(view)).toHaveLength(2);
  });

  it("renders Arabic right to left with its own language", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([{ category: "zero", sample: 0, text: "لا ملفات" }]),
    });
    const view = await renderAsync(panel("x", "ar"));

    await openPanel(view);

    const text = view.get("[data-icu-text]");
    expect(text.getAttribute("dir")).toBe("rtl");
    expect(text.getAttribute("lang")).toBe("ar");
  });

  it("renders segments as text nodes, isolating arguments and tags, never as markup", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": {
        ok: true,
        result: {
          supported: true,
          valid: true,
          arguments: { style: "none" },
          truncated: false,
          rows: [
            {
              axis: "none",
              argument: null,
              category: null,
              sample: null,
              segments: [
                { kind: "tag", text: "<img src=x onerror=alert(1)>" },
                { kind: "argument", text: "{name}" },
                { kind: "text", text: "<script>alert(2)</script>" },
                { kind: "tag", text: "</img>" },
              ],
            },
          ],
        },
      },
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.query("img, script, [onerror]")).toBeNull();
    const text = view.get("[data-icu-text]");
    expect(text.textContent).toBe(
      "<img src=x onerror=alert(1)>{name}<script>alert(2)</script></img>",
    );
    const isolated = [...text.querySelectorAll("bdi")];
    expect(isolated.map((node) => node.getAttribute("data-icu-segment"))).toEqual([
      "tag",
      "argument",
      "tag",
    ]);
    expect(isolated.every((node) => node.getAttribute("dir") === "ltr")).toBe(true);
  });

  it("wraps a very long unbroken value instead of widening its container", async () => {
    const long = "W".repeat(5000);
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([{ text: long }]),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    const text = view.get("[data-icu-text]");
    expect(text.textContent).toBe(long);
    expect(text.className).toContain("wrap-anywhere");
    expect(text.className).toContain("whitespace-pre-wrap");
  });

  it("shows the single row of a message with nothing to vary", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([
        { axis: "none", argument: null, category: null, sample: null, text: "Hello" },
      ]),
    });
    const view = await renderAsync(panel("Hello"));

    await openPanel(view);

    expect(rowsOf(view)).toHaveLength(1);
    expect(rowsOf(view)[0]?.textContent).toContain("No argument to vary");
    expect(rowsOf(view)[0]?.textContent).toContain("Hello");
  });

  it("shows all 24 rows and says rows were left out when the answer is truncated", async () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      category: `=${index}`,
      sample: index,
      text: `row ${index}`,
    }));
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer(rows, { truncated: true }),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(rowsOf(view)).toHaveLength(24);
    expect(view.get("[data-icu-truncated]").textContent).toContain("at most 24 rows");
  });

  it("says nothing about truncation when no arm was left out", async () => {
    stubRpc({ "project.snapshot": SNAPSHOT_ICU, "key.previewIcu": validAnswer([{ text: "x" }]) });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.query("[data-icu-truncated]")).toBeNull();
  });

  it("renders a nested plural row for each arm with the argument that varies", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([
        { axis: "select", argument: "g", category: "male", sample: "male", text: "He has 1 file" },
        { axis: "plural", argument: "n", category: "one", sample: 1, text: "He has 1 file" },
      ]),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(
      rowsOf(view).map(
        (row) => `${row.getAttribute("data-argument")}:${row.getAttribute("data-category")}`,
      ),
    ).toEqual(["g:male", "n:one"]);
  });
});

describe("IcuPreviewPanel refusals", () => {
  it.each([
    ["too-long", "over 20,000 characters"],
    ["too-complex", "nests too deeply"],
    ["invalid-message", "not valid ICU"],
    ["unsupported-locale", "does not know this locale"],
    ["too-large", "too large to show"],
  ])("says %s in words and shows no rows", async (reason, words) => {
    stubRpc({ "project.snapshot": SNAPSHOT_ICU, "key.previewIcu": refusal(reason) });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.get("[data-icu-refusal]").getAttribute("data-icu-refusal")).toBe(reason);
    expect(view.get("[data-icu-refusal]").textContent).toContain(words);
    expect(rowsOf(view)).toHaveLength(0);
  });
});

describe("IcuPreviewPanel sample values", () => {
  const NAMED = [
    { name: "n", type: "number" },
    { name: "who", type: "string" },
  ];

  async function openWithFields(): Promise<RenderResult> {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([{ text: "x" }], { named: NAMED }),
    });
    const view = await renderAsync(panel("{n} {who}"));
    await openPanel(view);
    return view;
  }

  it("offers one named input per argument the message uses", async () => {
    const view = await openWithFields();

    expect(
      view.all("[data-icu-sample]").map((node) => node.getAttribute("data-icu-sample")),
    ).toEqual(["n", "who"]);
    expect(textboxNamed(view, "n").getAttribute("placeholder")).toBe("default");
  });

  it("turns a typed 12 into the number 12 and reads again", async () => {
    const view = await openWithFields();
    const before = previewCalls().length;

    typeInto(textboxNamed(view, "n"), "12");
    await settle();

    const sent = previewCalls().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.params).toEqual({ locale: "de", value: "{n} {who}", args: { n: 12 } });
    expect(typeof (sent[0]?.params.args as { n: unknown } | undefined)?.n).toBe("number");
  });

  it("leaves invalid input visibly unset and sends nothing for it", async () => {
    const view = await openWithFields();
    const before = previewCalls().length;

    typeInto(textboxNamed(view, "n"), "abc");
    await settle();

    const field = textboxNamed(view, "n");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const note = view.get("[data-icu-sample-problem]");
    expect(field.getAttribute("aria-describedby")).toBe(note.id);
    expect(note.textContent).toContain("Not a number");
    expect(
      previewCalls()
        .slice(before)
        .every((call) => call.params.args === undefined),
    ).toBe(true);
  });

  it("clears the problem when the text is fixed or emptied", async () => {
    const view = await openWithFields();

    typeInto(textboxNamed(view, "n"), "abc");
    typeInto(textboxNamed(view, "n"), "");

    expect(textboxNamed(view, "n").getAttribute("aria-invalid")).toBeNull();
    expect(view.query("[data-icu-sample-problem]")).toBeNull();
  });

  it("sends a text sample for a string argument as text", async () => {
    const view = await openWithFields();
    const before = previewCalls().length;

    typeInto(textboxNamed(view, "who"), "42");
    await settle();

    expect(previewCalls().slice(before)[0]?.params.args).toEqual({ who: "42" });
  });

  it("keeps the samples while the message is briefly invalid", async () => {
    const view = await openWithFields();
    typeInto(textboxNamed(view, "n"), "7");
    stubRpc({ "key.previewIcu": refusal("invalid-message") });

    view.rerender(panel("{n, plural,"));
    await settle();

    expect(textboxNamed(view, "n").value).toBe("7");
  });

  it("offers no inputs when the message names no argument", async () => {
    stubRpc({ "project.snapshot": SNAPSHOT_ICU, "key.previewIcu": validAnswer([{ text: "x" }]) });
    const view = await renderAsync(panel("Hello"));

    await openPanel(view);

    expect(view.query("[data-icu-samples]")).toBeNull();
  });

  it("caps the inputs and says how many arguments it left out", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ name: `a${index}`, type: "number" }));
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": validAnswer([{ text: "x" }], { named: many }),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.all("[data-icu-sample]")).toHaveLength(24);
    expect(view.get("[data-icu-samples]").textContent).toContain("first 24 of 30 arguments");
  });
});

describe("IcuPreviewPanel failed reads", () => {
  it("shows the error with Retry, no rows, and leaves the host draft and focus alone", async () => {
    stubRpc({ "project.snapshot": SNAPSHOT_ICU, "key.previewIcu": rpcError("INTERNAL") });
    const view = await renderAsync(
      <>
        <textarea aria-label="draft" defaultValue="my draft" />
        {panel("my draft")}
      </>,
    );
    const draft = view.get("textarea") as HTMLTextAreaElement;
    draft.focus();

    await openPanel(view);

    expect(view.get('[role="alert"]').textContent).toContain("unexpected server error");
    expect(buttonNamed(view, "Retry")).toBeDefined();
    expect(rowsOf(view)).toHaveLength(0);
    expect(draft.value).toBe("my draft");
    expect(document.activeElement).toBe(draft);
  });

  it("retries at once, shows Retrying while it runs and moves focus to the recovered content", async () => {
    const retry = deferredAnswer();
    const answers: (StubRpcResult | Promise<StubRpcResult>)[] = [
      rpcError("INTERNAL"),
      retry.promise,
    ];
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": () => answers.shift() ?? validAnswer([]),
    });
    const view = await renderAsync(panel("x"));
    await openPanel(view);
    const calls = previewCalls().length;

    click(buttonNamed(view, "Retry"));
    await settle(0);
    const busy = view.get("[data-retry]");
    expect(busy.textContent).toBe("Retrying…");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    expect(busy.hasAttribute("disabled")).toBe(false);
    click(busy);
    await settle(0);
    expect(previewCalls().length).toBe(calls + 1);

    retry.resolve(validAnswer([{ text: "BACK" }]));
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(rowsOf(view)[0]?.textContent).toContain("BACK");
    expect(document.activeElement).toBe(view.get('[data-recovery-target="icu-preview"]'));
  });

  it("keeps focus on Retry when the retry fails again", async () => {
    stubRpc({ "project.snapshot": SNAPSHOT_ICU, "key.previewIcu": rpcError("INTERNAL") });
    const view = await renderAsync(panel("x"));
    await openPanel(view);
    const retry = view.get("[data-retry]");
    retry.focus();

    click(retry);
    await flush();

    expect(view.get('[role="alert"]')).toBeDefined();
    expect(document.activeElement).toBe(view.get("[data-retry]"));
  });

  it("never moves focus when a background read recovers", async () => {
    const answers: StubRpcResult[] = [rpcError("INTERNAL"), validAnswer([{ text: "OK" }])];
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": () => answers.shift() ?? validAnswer([]),
    });
    const view = await renderAsync(
      <>
        <textarea aria-label="draft" />
        {panel("a")}
      </>,
    );
    await openPanel(view);
    const draft = view.get("textarea") as HTMLTextAreaElement;
    draft.focus();

    view.rerender(
      <>
        <textarea aria-label="draft" />
        {panel("ab")}
      </>,
    );
    await settle();

    expect(rowsOf(view)).toHaveLength(1);
    expect(document.activeElement).toBe(draft);
  });

  it("treats a rate limit as a failed read that can be retried", async () => {
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": rpcError("METHOD_RATE_LIMITED"),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.get('[role="alert"]').textContent).toContain("limiting how often");
    expect(buttonNamed(view, "Retry")).toBeDefined();
  });

  it("recovers from an unreachable server on the next draft without a retry", async () => {
    const answers: StubRpcResult[] = [rpcError("NETWORK_ERROR"), validAnswer([{ text: "BACK" }])];
    stubRpc({
      "project.snapshot": SNAPSHOT_ICU,
      "key.previewIcu": () => answers.shift() ?? validAnswer([]),
    });
    const view = await renderAsync(panel("a"));
    await openPanel(view);

    view.rerender(panel("ab"));
    await settle();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(rowsOf(view)[0]?.textContent).toContain("BACK");
  });
});

describe("IcuPreviewPanel mounting", () => {
  it("does not read before it is rendered open", () => {
    stubRpc({ "project.snapshot": SNAPSHOT_ICU });

    render(panel("x"));

    expect(previewCalls()).toHaveLength(0);
  });
});
