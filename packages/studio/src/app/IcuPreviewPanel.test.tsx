// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ICU_PREVIEW_DELAY_MS } from "../client/icu-preview.js";
import { IcuPreviewPanel } from "./IcuPreviewPanel.js";
import { IcuPreviewAvailabilityProvider, resetIcuPreviewSession } from "./icu-preview-open.js";
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

interface Row {
  readonly axis?: string;
  readonly argument?: string | null;
  readonly category?: string | null;
  readonly sample?: string | number | null;
  readonly held?: Readonly<Record<string, string | number>>;
  readonly supplied?: boolean;
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
        held: row.held ?? {},
        supplied: row.supplied ?? false,
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

function panel(value: string, locale = "de", available = true): ReactElement {
  return (
    <IcuPreviewAvailabilityProvider value={available}>
      <IcuPreviewPanel keyName="inbox.count" locale={locale} value={value} />
    </IcuPreviewAvailabilityProvider>
  );
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
  resetIcuPreviewSession();
});

afterEach(() => {
  vi.useRealTimers();
  resetIcuPreviewSession();
});

describe("IcuPreviewPanel visibility", () => {
  it("renders nothing, and makes no read at all, where the project offers no ICU preview", async () => {
    stubRpc({});

    const view = await renderAsync(panel("Hi", "de", false));

    expect(view.container.innerHTML).toBe("");
    expect(rpcCalls).toHaveLength(0);
  });

  it("renders nothing outside any provider, as when the snapshot failed", async () => {
    const view = await renderAsync(<IcuPreviewPanel keyName="k" locale="de" value="Hi" />);

    expect(view.container.innerHTML).toBe("");
  });

  it("is closed by default, named by a button, and reads nothing until opened", async () => {
    stubRpc({});

    const view = await renderAsync(panel("Hi"));
    await settle(2000);

    const toggle = buttonNamed(view, "ICU preview");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(view.query("[data-recovery-target]")).toBeNull();
    expect(previewCalls()).toHaveLength(0);
  });

  it("opens and closes only through its button, and remembers the choice for the session", async () => {
    stubRpc({
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
      "key.previewIcu": validAnswer([{ text: "x" }]),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.text()).toContain("Uses this computer's language data, so your app may differ.");
    expect(view.all("[title], [role='tooltip']")).toHaveLength(0);
  });
});

describe("IcuPreviewPanel reads", () => {
  it("waits for the typing to pause and sends only the last draft", async () => {
    stubRpc({
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
    stubRpc({ "key.previewIcu": () => slow.promise });
    const view = await renderAsync(panel("one"));
    await openPanel(view);

    click(buttonNamed(view, "ICU preview"));
    slow.resolve(validAnswer([{ text: "LATE" }]));
    await flush();

    expect(view.text()).not.toContain("LATE");
  });

  it("does not ask again for a value over the boundary cap and says it is too long", async () => {
    stubRpc({ "key.previewIcu": validAnswer([{ text: "x" }]) });
    const view = await renderAsync(panel("x".repeat(20_001)));

    await openPanel(view);

    expect(previewCalls()).toHaveLength(0);
    expect(view.get("[data-icu-refusal]").getAttribute("data-icu-refusal")).toBe("too-long");
  });

  it("hides itself and stops reading when the server says the format has no ICU", async () => {
    stubRpc({
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
              held: {},
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
    expect(isolated.map((node) => node.getAttribute("dir"))).toEqual(["ltr", "auto", "ltr"]);
  });

  it("wraps a very long unbroken value instead of widening its container", async () => {
    const long = "W".repeat(5000);
    stubRpc({
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
      "key.previewIcu": validAnswer([
        { axis: "none", argument: null, category: null, sample: null, text: "Hello" },
      ]),
    });
    const view = await renderAsync(panel("Hello"));

    await openPanel(view);

    expect(rowsOf(view)).toHaveLength(1);
    expect(rowsOf(view)[0]?.textContent).toContain("Rendered text");
    expect(rowsOf(view)[0]?.textContent).toContain("Hello");
  });

  it("shows all 24 rows and says rows were left out when the answer is truncated", async () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      category: `=${index}`,
      sample: index,
      text: `row ${index}`,
    }));
    stubRpc({
      "key.previewIcu": validAnswer(rows, { truncated: true }),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(rowsOf(view)).toHaveLength(24);
    expect(view.get("[data-icu-truncated]").textContent).toContain("at most 24 rows");
  });

  it("says nothing about truncation when no arm was left out", async () => {
    stubRpc({ "key.previewIcu": validAnswer([{ text: "x" }]) });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.query("[data-icu-truncated]")).toBeNull();
  });

  it("renders a nested plural row for each arm with the argument that varies", async () => {
    stubRpc({
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
    stubRpc({ "key.previewIcu": refusal(reason) });
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
    expect(textboxNamed(view, "n").getAttribute("placeholder")).toBe("automatic");
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
    stubRpc({ "key.previewIcu": validAnswer([{ text: "x" }]) });
    const view = await renderAsync(panel("Hello"));

    await openPanel(view);

    expect(view.query("[data-icu-samples]")).toBeNull();
  });

  it("caps the inputs and says how many arguments it left out", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ name: `a${index}`, type: "number" }));
    stubRpc({
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
    stubRpc({ "key.previewIcu": rpcError("INTERNAL") });
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
    stubRpc({ "key.previewIcu": rpcError("INTERNAL") });
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

describe("IcuPreviewPanel held arguments and sample rows", () => {
  const NESTED = [
    { axis: "select", argument: "g", category: "f", sample: "f", text: "She" },
    { axis: "select", argument: "g", category: "m", sample: "m", text: "He" },
    { argument: "n", category: "one", sample: 1, held: { g: "f" }, text: "She 1" },
    { argument: "n", category: "one", sample: 1, held: { g: "m" }, text: "He 1" },
    { argument: "n", category: "other", sample: 2, held: { g: "f" }, text: "She 2" },
    { argument: "n", category: "other", sample: 2, held: { g: "m" }, text: "He 2" },
  ];

  it("groups nested rows under the outer arm they sit in, so no two rows share a label", async () => {
    stubRpc({ "key.previewIcu": validAnswer(NESTED) });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    const groups = view.all("[data-icu-group]");
    expect(groups.map((group) => group.getAttribute("data-icu-group"))).toEqual(["g=f", "g=m"]);
    expect(view.all("[data-icu-held]").map((node) => node.textContent)).toEqual(["g=f", "g=m"]);
    expect(
      groups.map((group) =>
        [...group.querySelectorAll("[data-icu-row]")].map((row) => row.textContent),
      ),
    ).toEqual([
      [expect.stringContaining("She 1"), expect.stringContaining("She 2")],
      [expect.stringContaining("He 1"), expect.stringContaining("He 2")],
    ]);
    expect(rowsOf(view)).toHaveLength(6);
  });

  it("shows a value the caller typed as its own row, named as theirs", async () => {
    stubRpc({
      "key.previewIcu": validAnswer([
        { category: "one", sample: 1, text: "1 plik" },
        { supplied: true, category: "few", sample: 22, text: "22 pliki" },
      ]),
    });
    const view = await renderAsync(panel("x", "pl"));

    await openPanel(view);

    const row = view.get("[data-supplied]");
    expect(row.textContent).toContain("Your value");
    expect(row.textContent).toContain("few");
    expect(row.textContent).toContain("= 22");
  });

  it("says a message without arguments to vary is rendered text, without a blank card for an empty draft", async () => {
    stubRpc({
      "key.previewIcu": validAnswer([
        { axis: "none", argument: null, category: null, sample: null, text: "" },
      ]),
    });
    const view = await renderAsync(panel(""));

    await openPanel(view);

    expect(view.get("[data-icu-empty]").textContent).toContain("empty");
    expect(rowsOf(view)).toHaveLength(0);
  });
});

describe("IcuPreviewPanel mid-typing refusals", () => {
  it("keeps the last good rows, dimmed and labelled, under the reason", async () => {
    const answers: StubRpcResult[] = [
      validAnswer([{ category: "one", text: "GOOD" }]),
      refusal("invalid-message"),
    ];
    stubRpc({ "key.previewIcu": () => answers.shift() ?? validAnswer([]) });
    const view = await renderAsync(panel("{n, plural, one {a} other {b}}"));
    await openPanel(view);

    view.rerender(panel("{n, plural, one {a"));
    await settle();

    const reason = view.get("[data-icu-refusal]");
    const stale = view.get("[data-icu-stale]");
    const note = view.get("[data-icu-stale-note]");
    expect(reason.textContent).toContain("not valid ICU");
    expect(note.textContent).toContain("These rows are from the last valid text.");
    expect(stale.textContent).toContain("GOOD");
    expect(stale.querySelector(".text-muted-foreground")).not.toBeNull();
    expect(stale.querySelector(".opacity-60")).toBeNull();
    expect(reason.compareDocumentPosition(stale) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the reason alone when the first draft is already invalid", async () => {
    stubRpc({ "key.previewIcu": refusal("invalid-message") });
    const view = await renderAsync(panel("{"));

    await openPanel(view);

    expect(view.get("[data-icu-refusal]")).toBeDefined();
    expect(view.query("[data-icu-stale]")).toBeNull();
  });

  it("brings the new rows back, undimmed, when the draft is valid again", async () => {
    const answers: StubRpcResult[] = [
      validAnswer([{ text: "GOOD" }]),
      refusal("invalid-message"),
      validAnswer([{ text: "NEXT" }]),
    ];
    stubRpc({ "key.previewIcu": () => answers.shift() ?? validAnswer([]) });
    const view = await renderAsync(panel("a"));
    await openPanel(view);
    view.rerender(panel("b"));
    await settle();

    view.rerender(panel("c"));
    await settle();

    expect(view.query("[data-icu-stale]")).toBeNull();
    expect(view.query("[data-icu-refusal]")).toBeNull();
    expect(rowsOf(view)[0]?.textContent).toContain("NEXT");
  });
});

describe("IcuPreviewPanel Retry focus", () => {
  async function failedThenRecovering(): Promise<{
    readonly view: RenderResult;
    readonly recover: () => Promise<void>;
  }> {
    const retry = deferredAnswer();
    const answers: (StubRpcResult | Promise<StubRpcResult>)[] = [
      rpcError("INTERNAL"),
      retry.promise,
    ];
    stubRpc({ "key.previewIcu": () => answers.shift() ?? validAnswer([{ text: "BACK" }]) });
    const view = await renderAsync(
      <>
        <textarea aria-label="draft" />
        {panel("x")}
      </>,
    );
    await openPanel(view);
    click(buttonNamed(view, "Retry"));
    await settle(0);
    return {
      view,
      recover: async () => {
        retry.resolve(validAnswer([{ text: "BACK" }]));
        await flush();
      },
    };
  }

  it("does not pull focus back from the draft when the retried read answers", async () => {
    const { view, recover } = await failedThenRecovering();
    (view.get("textarea") as HTMLTextAreaElement).focus();

    await recover();

    expect(rowsOf(view)[0]?.textContent).toContain("BACK");
    expect(document.activeElement).toBe(view.get("textarea"));
  });

  it("does not move focus once the value changed after Retry", async () => {
    const { view, recover } = await failedThenRecovering();
    (document.activeElement as HTMLElement | null)?.blur();
    view.rerender(
      <>
        <textarea aria-label="draft" />
        {panel("xy")}
      </>,
    );

    await recover();
    await settle();

    expect(document.activeElement).not.toBe(view.get('[data-recovery-target="icu-preview"]'));
  });

  it("moves focus to the content when it was on Retry or inside the panel", async () => {
    const { view, recover } = await failedThenRecovering();

    await recover();

    expect(document.activeElement).toBe(view.get('[data-recovery-target="icu-preview"]'));
  });
});

describe("IcuPreviewPanel failed read details", () => {
  it("keeps the wait the server asked for", async () => {
    stubRpc({
      "key.previewIcu": {
        ok: false,
        error: { code: "METHOD_RATE_LIMITED", message: "slow down", retryAfterSeconds: 5 },
      },
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.get('[role="alert"]').textContent).toContain("Try again in 5 seconds.");
  });

  it("announces that it is updating through a status region", async () => {
    stubRpc({ "key.previewIcu": validAnswer([{ text: "x" }]) });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.get("[data-icu-status]").getAttribute("role")).toBe("status");
  });
});

describe("IcuPreviewPanel sample typing", () => {
  const FIELDS = [
    { name: "n", type: "number" },
    { name: "when", type: "date" },
  ];

  async function opened(): Promise<RenderResult> {
    stubRpc({ "key.previewIcu": validAnswer([{ text: "x" }], { named: FIELDS }) });
    const view = await renderAsync(panel("{n} {when, date}"));
    await openPanel(view);
    return view;
  }

  it("reads a decimal comma as a decimal point", async () => {
    const view = await opened();
    const before = previewCalls().length;

    typeInto(textboxNamed(view, "n"), "1,5");
    await settle();

    expect(previewCalls().slice(before)[0]?.params.args).toEqual({ n: 1.5 });
  });

  it("lets a minus be typed on a touch keyboard", async () => {
    const view = await opened();

    expect(textboxNamed(view, "n").getAttribute("inputmode")).toBe("text");
  });

  it("turns a calendar date into milliseconds", async () => {
    const view = await opened();
    const before = previewCalls().length;

    typeInto(textboxNamed(view, "when"), "2024-03-15");
    await settle();

    expect(previewCalls().slice(before)[0]?.params.args).toEqual({ when: 1710460800000 });
  });

  it("notes a date outside what a computer can show instead of sending it", async () => {
    const view = await opened();
    const before = previewCalls().length;

    typeInto(textboxNamed(view, "when"), "9000000000000000");
    await settle();

    expect(view.get("[data-icu-sample-problem]").textContent).toContain("Outside the dates");
    expect(
      previewCalls()
        .slice(before)
        .every((call) => call.params.args === undefined),
    ).toBe(true);
  });

  it("offers inputs for numbered arguments", async () => {
    stubRpc({
      "key.previewIcu": {
        ok: true,
        result: {
          supported: true,
          valid: true,
          arguments: { style: "positional", positional: ["number"] },
          truncated: false,
          rows: [
            {
              axis: "none",
              argument: null,
              category: null,
              sample: null,
              held: {},
              segments: [{ kind: "text", text: "x" }],
            },
          ],
        },
      },
    });
    const view = await renderAsync(panel("{0}"));
    await openPanel(view);
    const before = previewCalls().length;

    typeInto(textboxNamed(view, "0"), "3");
    await settle();

    expect(previewCalls().slice(before)[0]?.params.args).toEqual({ 0: 3 });
  });
});

describe("IcuPreviewPanel round two", () => {
  const FIELDS = [{ name: "n", type: "number" }];

  it("puts the typed value's row first, with the arms it holds, above every other row", async () => {
    stubRpc({
      "key.previewIcu": validAnswer(
        [
          { category: "one", sample: 1, text: "ONE" },
          {
            supplied: true,
            argument: "n",
            category: "few",
            sample: 22,
            held: { gender: "female" },
            text: "TYPED",
          },
        ],
        { named: FIELDS },
      ),
    });
    const view = await renderAsync(panel("x", "pl"));

    await openPanel(view);

    expect(rowsOf(view)[0]?.textContent).toContain("TYPED");
    expect(rowsOf(view)[0]?.textContent).toContain("Your value");
    expect(rowsOf(view)[0]?.textContent).toContain("gender");
    expect(rowsOf(view)[0]?.textContent).toContain("female");
    expect(rowsOf(view)[0]?.closest("[data-icu-supplied]")).not.toBeNull();
    expect(view.all("[data-icu-group]")).toHaveLength(0);
  });

  it("lets a long typed value wrap instead of scrolling sideways", async () => {
    const long = "w".repeat(60);
    stubRpc({
      "key.previewIcu": validAnswer([
        {
          supplied: true,
          axis: "select",
          argument: "g",
          category: "other",
          sample: long,
          text: "x",
        },
      ]),
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    const value = [...view.get("[data-supplied]").querySelectorAll("span")].find((span) =>
      span.textContent?.includes(long),
    );
    expect(value?.className).toContain("wrap-anywhere");
    expect(value?.className).toContain("min-w-0");
  });

  it("sets rendered argument text in sans and keeps mono for tags", async () => {
    stubRpc({
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
              held: {},
              supplied: false,
              segments: [
                { kind: "argument", text: "15 March" },
                { kind: "tag", text: "<b>" },
              ],
            },
          ],
        },
      },
    });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(view.get('[data-icu-segment="argument"]').className).not.toContain("font-mono");
    expect(view.get('[data-icu-segment="tag"]').className).toContain("font-mono");
  });

  it("keeps one reserved block, the same shape, whether the draft is valid or not", async () => {
    const answers: StubRpcResult[] = [validAnswer([{ text: "GOOD" }]), refusal("invalid-message")];
    stubRpc({ "key.previewIcu": () => answers.shift() ?? validAnswer([]) });
    const view = await renderAsync(panel("a"));
    await openPanel(view);
    const shape = (): number => view.get("[data-icu-notice]").children.length;
    const valid = shape();
    const reservedWhenValid = view.all("[data-icu-notice] .invisible").length;

    view.rerender(panel("{"));
    await settle();

    expect(shape()).toBe(valid);
    expect(reservedWhenValid).toBeGreaterThan(0);
    expect(
      view
        .all("[data-icu-notice] [aria-hidden]")
        .every((node) => node.classList.contains("invisible")),
    ).toBe(true);
    expect(view.all("[data-icu-refusal]")).toHaveLength(1);
  });

  it("does not claim there is nothing to preview in a refusal", async () => {
    stubRpc({ "key.previewIcu": refusal("invalid-message") });
    const view = await renderAsync(panel("{"));

    await openPanel(view);

    expect(view.get("[data-icu-refusal]").textContent).not.toContain("nothing to preview");
  });

  it("keeps the last good rows, muted, under a failed read too", async () => {
    const answers: StubRpcResult[] = [validAnswer([{ text: "GOOD" }]), rpcError("INTERNAL")];
    stubRpc({ "key.previewIcu": () => answers.shift() ?? validAnswer([]) });
    const view = await renderAsync(panel("a"));
    await openPanel(view);

    view.rerender(panel("b"));
    await settle();

    expect(view.get('[role="alert"]')).toBeDefined();
    const stale = view.get("[data-icu-stale]");
    expect(stale.textContent).toContain("GOOD");
    expect(stale.textContent).toContain("These rows are from the last valid text.");
    expect(stale.querySelector(".text-muted-foreground")).not.toBeNull();
  });
});

describe("IcuPreviewPanel Retry focus and samples", () => {
  it("does not count a focused sample input as still being in the panel", async () => {
    const retry = deferredAnswer();
    const answers: (StubRpcResult | Promise<StubRpcResult>)[] = [
      validAnswer([{ text: "FIRST" }], { named: [{ name: "n", type: "number" }] }),
      rpcError("INTERNAL"),
      retry.promise,
    ];
    stubRpc({ "key.previewIcu": () => answers.shift() ?? validAnswer([]) });
    const view = await renderAsync(panel("a"));
    await openPanel(view);
    view.rerender(panel("b"));
    await settle();
    click(buttonNamed(view, "Retry"));
    await settle(0);
    const sample = textboxNamed(view, "n");
    sample.focus();

    retry.resolve(validAnswer([{ text: "BACK" }], { named: [{ name: "n", type: "number" }] }));
    await flush();

    expect(rowsOf(view)[0]?.textContent).toContain("BACK");
    expect(document.activeElement).toBe(sample);
  });

  it("treats a sample edit as leaving the Retry: the recovery does not move focus", async () => {
    const retry = deferredAnswer();
    const named = [{ name: "n", type: "number" }];
    const answers: (StubRpcResult | Promise<StubRpcResult>)[] = [
      validAnswer([{ text: "FIRST" }], { named }),
      rpcError("INTERNAL"),
      retry.promise,
    ];
    stubRpc({
      "key.previewIcu": () => answers.shift() ?? validAnswer([{ text: "AGAIN" }], { named }),
    });
    const view = await renderAsync(panel("a"));
    await openPanel(view);
    view.rerender(panel("b"));
    await settle();
    click(buttonNamed(view, "Retry"));
    await settle(0);
    typeInto(textboxNamed(view, "n"), "3");
    (document.activeElement as HTMLElement | null)?.blur();

    retry.resolve(validAnswer([{ text: "BACK" }], { named }));
    await flush();
    await settle();

    expect(document.activeElement).not.toBe(view.get('[data-recovery-target="icu-preview"]'));
  });
});

describe("IcuPreviewPanel notes for values the text does not use", () => {
  const FIELDS = [
    { name: "n", type: "number" },
    { name: "who", type: "unknown" },
  ];

  it("notes a typed value that reached no arm", async () => {
    stubRpc({
      "key.previewIcu": validAnswer([{ category: "one", text: "ONE" }], { named: FIELDS }),
    });
    const view = await renderAsync(panel("x"));
    await openPanel(view);

    typeInto(textboxNamed(view, "n"), "7");
    await settle();

    const note = view.get("[data-icu-sample-unused]");
    expect(note.textContent).toBe("Not used by this text.");
    expect(textboxNamed(view, "n").getAttribute("aria-describedby")).toBe(note.id);
  });

  it("does not note a value that has a row", async () => {
    stubRpc({
      "key.previewIcu": validAnswer(
        [
          { category: "one", text: "ONE" },
          { supplied: true, category: "other", sample: 7, text: "SEVEN" },
        ],
        { named: FIELDS },
      ),
    });
    const view = await renderAsync(panel("x"));
    await openPanel(view);

    typeInto(textboxNamed(view, "n"), "7");
    await settle();

    expect(view.query("[data-icu-sample-unused]")).toBeNull();
  });

  it("notes plain text that no rendered argument shows", async () => {
    stubRpc({
      "key.previewIcu": validAnswer(
        [{ axis: "none", argument: null, category: null, sample: null, text: "t" }],
        { named: FIELDS },
      ),
    });
    const view = await renderAsync(panel("x"));
    await openPanel(view);

    typeInto(textboxNamed(view, "who"), "Ada");
    await settle();

    expect(view.get('[data-icu-sample="who"] [data-icu-sample-unused]')).toBeDefined();
  });

  it("waits for the answer before saying anything, and prefers the invalid-input note", async () => {
    stubRpc({
      "key.previewIcu": validAnswer([{ category: "one", text: "ONE" }], { named: FIELDS }),
    });
    const view = await renderAsync(panel("x"));
    await openPanel(view);

    typeInto(textboxNamed(view, "n"), "7");
    expect(view.query("[data-icu-sample-unused]")).toBeNull();
    typeInto(textboxNamed(view, "n"), "abc");
    await settle();

    expect(view.query("[data-icu-sample-unused]")).toBeNull();
    expect(view.get("[data-icu-sample-problem]")).toBeDefined();
  });

  it("gives the sample inputs a scroll margin so the row below them stays clear", async () => {
    stubRpc({ "key.previewIcu": validAnswer([{ text: "x" }], { named: FIELDS }) });
    const view = await renderAsync(panel("x"));
    await openPanel(view);

    expect(textboxNamed(view, "n").className).toContain("scroll-mb-40");
  });
});

describe("IcuPreviewPanel reserved refusal height", () => {
  it("reserves only the common refusal and grows for a rare one", async () => {
    const answers: StubRpcResult[] = [validAnswer([{ text: "GOOD" }]), refusal("too-complex")];
    stubRpc({ "key.previewIcu": () => answers.shift() ?? validAnswer([]) });
    const view = await renderAsync(panel("a"));
    await openPanel(view);
    const children = (): number => view.get("[data-icu-notice]").children.length;
    const valid = children();

    view.rerender(panel("b"));
    await settle();

    expect(valid).toBe(2);
    expect(children()).toBe(3);
    expect(view.get("[data-icu-refusal]").getAttribute("data-icu-refusal")).toBe("too-complex");
  });
});

describe("IcuPreviewPanel refusal announcement", () => {
  it("announces the active refusal and keeps the reserved copies silent", async () => {
    stubRpc({ "key.previewIcu": refusal("invalid-message") });
    const view = await renderAsync(panel("{"));

    await openPanel(view);

    const active = view.get("[data-icu-refusal]");
    expect(active.getAttribute("role")).toBe("status");
    expect(active.getAttribute("aria-hidden")).toBeNull();
    const silent = view.all("[data-icu-notice] > div").filter((node) => node !== active);
    expect(silent.every((node) => node.getAttribute("role") === null)).toBe(true);
  });

  it("has no refusal region while the draft is valid", async () => {
    stubRpc({ "key.previewIcu": validAnswer([{ text: "x" }]) });
    const view = await renderAsync(panel("x"));

    await openPanel(view);

    expect(
      view
        .all('[data-icu-notice] [role="status"]')
        .map((node) => node.hasAttribute("data-icu-status")),
    ).toEqual([true]);
  });
});

describe("IcuPreviewPanel mounting", () => {
  it("does not read before it is rendered open", () => {
    stubRpc({});

    render(panel("x"));

    expect(previewCalls()).toHaveLength(0);
  });
});
