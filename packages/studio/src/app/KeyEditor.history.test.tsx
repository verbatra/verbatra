// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../client/diff-view.js";
import type { KeyRevisionRow } from "../client/key-history.js";
import { KeyEditor } from "./KeyEditor.js";
import {
  click,
  clickAsync,
  emitRefresh,
  flush,
  renderAsync,
  rpcCalls,
  type StubRpcResult,
  selectOption,
  stubRpc,
  typeInto,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const KEY = "greeting.hello";
const NO_GLOSSARY = { terms: [], doNotTranslate: [] };

function localeDiff(locale: string): DiffLocale {
  return { locale, missing: [], changed: [KEY], orphaned: [], hasPendingChanges: true };
}

function revision(
  commit: string,
  value: string,
  overrides: Partial<KeyRevisionRow> = {},
): KeyRevisionRow {
  return {
    commit: commit.repeat(40).slice(0, 40),
    authorDate: "2026-01-02T03:04:05+00:00",
    author: "Ada",
    subject: `set ${value}`,
    value,
    sourceChanged: false,
    diff: [{ kind: "added", text: value }],
    ...overrides,
  };
}

function history(...revisions: KeyRevisionRow[]): StubRpcResult {
  return {
    ok: true,
    result: { available: true, revisions, truncated: false, unreadableRevisions: 0 },
  };
}

function stubProject(
  historyAnswer: StubRpcResult | ((params: unknown) => StubRpcResult | Promise<StubRpcResult>),
): void {
  stubRpc({
    "history.list": { ok: true, result: { available: false, reason: "not-a-repository" } },
    "key.integrity": { ok: true, result: { locales: [] } },
    "project.snapshot": { ok: true, result: { capabilities: { spend: false, writeToDisk: true } } },
    "key.value": { ok: true, result: { source: "Hello", target: "Hallo" } },
    "key.context": {
      ok: true,
      result: { source: "Hello", target: "Hallo", glossary: NO_GLOSSARY },
    },
    "history.keyRevisions": historyAnswer,
    "translation.editEntry": { ok: true, result: { accepted: true, value: "x" } },
  });
}

function Editor({
  locales = [localeDiff("de")],
  refreshToken = 0,
}: {
  readonly locales?: readonly DiffLocale[];
  readonly refreshToken?: number;
}): ReactNode {
  return (
    <KeyEditor
      keyName={KEY}
      locales={locales}
      refreshToken={refreshToken}
      layout="drawer"
      onClose={() => {}}
      onEscape={() => {}}
      onRouteSettled={() => {}}
      missing={false}
      onDirtyChange={() => {}}
    />
  );
}

type View = Awaited<ReturnType<typeof renderAsync>>;

async function openHistory(view: View): Promise<void> {
  await clickAsync(view.get('[role="tab"][data-tab="history"]'));
  await flush();
}

function field(view: View): HTMLTextAreaElement {
  return view.get('textarea[aria-label="Translation (de)"]') as HTMLTextAreaElement;
}

function historyCalls(): unknown[] {
  return rpcCalls
    .filter((call) => call.method === "history.keyRevisions")
    .map((call) => call.params);
}

describe("KeyEditor history tab", () => {
  it("reads nothing until the History tab opens, and then reads the open locale and key", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);

    expect(historyCalls()).toEqual([]);
    expect(view.get('[role="tab"][data-tab="locales"]').getAttribute("aria-selected")).toBe("true");

    await openHistory(view);

    expect(historyCalls()).toEqual([{ locale: "de", key: KEY }]);
    expect(view.get('[role="tabpanel"]').textContent).toContain("set Servus");
  });

  it("moves between the tabs with the arrow keys and keeps one tab stop", async () => {
    stubProject(history());
    const view = await renderAsync(<Editor />);
    const locales = view.get('[data-tab="locales"]');
    const historyTab = view.get('[data-tab="history"]');

    expect(locales.getAttribute("tabindex")).toBe("0");
    expect(historyTab.getAttribute("tabindex")).toBe("-1");
    act(() => {
      locales.focus();
      locales.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await flush();

    expect(historyTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(historyTab);
    act(() => {
      historyTab.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(view.get('[data-tab="locales"]').getAttribute("aria-selected")).toBe("true");
    act(() => {
      view
        .get('[data-tab="locales"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(view.get('[data-tab="history"]').getAttribute("aria-selected")).toBe("true");
    act(() => {
      view
        .get('[data-tab="history"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      view
        .get('[data-tab="locales"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(view.get('[data-tab="locales"]').getAttribute("aria-selected")).toBe("true");
  });

  it("drops an older answer when another locale was chosen while it was pending", async () => {
    let release: (value: StubRpcResult) => void = () => {};
    stubProject((params) =>
      (params as { locale: string }).locale === "de"
        ? new Promise<StubRpcResult>((resolve) => {
            release = resolve;
          })
        : history(revision("b", "Salut")),
    );
    const view = await renderAsync(<Editor locales={[localeDiff("de"), localeDiff("fr")]} />);
    await openHistory(view);

    selectOption(view.get("select[data-history-locale-select]") as HTMLSelectElement, "fr");
    await flush();
    await act(async () => {
      release(history(revision("a", "Hallo-late")));
      await Promise.resolve();
    });

    const text = view.get('[role="tabpanel"]').textContent ?? "";
    expect(text).toContain("set Salut");
    expect(text).not.toContain("Hallo-late");
  });

  it("restores a value as a draft on the Locales tab, saves it through editEntry with no actor", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await openHistory(view);

    await clickAsync(view.get("button[data-restore]"));
    await flush();

    expect(view.get('[data-tab="locales"]').getAttribute("aria-selected")).toBe("true");
    expect(field(view).value).toBe("Servus");
    expect(document.activeElement).toBe(field(view));
    expect(rpcCalls.some((call) => call.method === "translation.editEntry")).toBe(false);

    await clickAsync(view.getByText("button", "Save"));
    await flush();

    const save = rpcCalls.find((call) => call.method === "translation.editEntry");
    expect(save?.params).toEqual({ locale: "de", key: KEY, value: "Servus" });
  });

  it("asks before loading a revision whose source changed", async () => {
    stubProject(history(revision("a", "Servus", { sourceChanged: true })));
    const view = await renderAsync(<Editor />);
    await openHistory(view);

    await clickAsync(view.get("button[data-restore]"));
    expect(view.query("textarea")).toBeNull();
    expect(view.get("[data-restore-confirm]")).not.toBeNull();

    await clickAsync(view.getByText("button", "Load as draft"));
    await flush();

    expect(field(view).value).toBe("Servus");
  });

  it("prompts instead of overwriting a dirty draft, and keeps it on Keep editing", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();
    typeInto(field(view), "my own words");
    await openHistory(view);
    expect(view.get("[data-tab-unsaved]").textContent).toBe("Unsaved");

    await clickAsync(view.get("button[data-restore]"));
    await flush();

    expect(view.get("[data-unsaved-prompt]")).not.toBeNull();
    expect(view.get('[data-tab="locales"]').getAttribute("aria-selected")).toBe("true");
    expect(field(view).value).toBe("my own words");

    await clickAsync(view.getByText("button", "Keep editing"));
    await flush();

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(field(view).value).toBe("my own words");
  });

  it("replaces a dirty draft only after Discard", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();
    typeInto(field(view), "my own words");
    await openHistory(view);
    await clickAsync(view.get("button[data-restore]"));
    await flush();

    await clickAsync(view.getByText("button", "Discard"));
    await flush();

    expect(field(view).value).toBe("Servus");
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
  });

  it("re-reads in the background on a refresh without moving focus or the rows", async () => {
    let answers = 0;
    stubProject(() => {
      answers += 1;
      return history(revision("a", `Servus ${answers}`));
    });
    const view = await renderAsync(<Editor refreshToken={0} />);
    await openHistory(view);
    const restore = view.get("button[data-restore]");
    act(() => restore.focus());

    view.rerender(<Editor refreshToken={1} />);
    await flush();

    expect(historyCalls()).toHaveLength(2);
    expect(view.get("[data-revision-subject]").textContent).toBe("set Servus 2");
    expect(document.activeElement?.hasAttribute("data-restore")).toBe(true);
  });

  it("re-reads when git moves, and keeps the last answer when that read fails", async () => {
    let answers = 0;
    stubProject(() => {
      answers += 1;
      return answers === 1
        ? history(revision("a", "Servus"))
        : { ok: false, error: { code: "INTERNAL", message: "boom" } };
    });
    const view = await renderAsync(<Editor />);
    await openHistory(view);

    emitRefresh({ reason: "git", at: "2026-01-01T00:00:00.000Z" });
    await flush();

    expect(historyCalls()).toHaveLength(2);
    expect(view.get("[data-revision-subject]").textContent).toBe("set Servus");
    expect(view.get('[role="alert"]').textContent).toContain("last answer is shown");
  });

  it("keeps the last answer when a refresh times out", async () => {
    let answers = 0;
    stubProject(() => {
      answers += 1;
      return answers === 1
        ? history(revision("a", "Servus"))
        : { ok: true, result: { available: false, reason: "timeout" } };
    });
    const view = await renderAsync(<Editor refreshToken={0} />);
    await openHistory(view);

    view.rerender(<Editor refreshToken={1} />);
    await flush();

    expect(view.get("[data-revision-subject]").textContent).toBe("set Servus");
    expect(view.get('[role="alert"]').textContent).toContain("too long");
  });

  it("re-reads when the window is focused again", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await openHistory(view);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await flush();

    expect(historyCalls()).toHaveLength(2);
    expect(view.query("[data-revision]")).not.toBeNull();
  });

  it("says git is missing as a calm sentence and Retry reads again after an error", async () => {
    let answers = 0;
    stubProject(() => {
      answers += 1;
      return answers === 1
        ? { ok: false, error: { code: "INTERNAL", message: "boom" } }
        : { ok: true, result: { available: false, reason: "not-a-repository" } };
    });
    const view = await renderAsync(<Editor />);
    await openHistory(view);
    expect(view.get('[role="alert"]')).not.toBeNull();

    click(view.getByText("button", "Retry"));
    await flush();

    expect(view.get("[data-history-unavailable]").textContent).toContain("not in a git repository");
  });
});
