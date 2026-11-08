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
    result: {
      available: true,
      revisions,
      truncated: false,
      truncatedBy: [],
      unreadableRevisions: 0,
    },
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
  layout = "drawer",
  onClose = () => {},
}: {
  readonly locales?: readonly DiffLocale[];
  readonly refreshToken?: number;
  readonly layout?: "pane" | "drawer";
  readonly onClose?: () => void;
}): ReactNode {
  return (
    <KeyEditor
      keyName={KEY}
      locales={locales}
      refreshToken={refreshToken}
      layout={layout}
      onClose={onClose}
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

async function later(): Promise<void> {
  await flush();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1600));
  });
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
    expect(view.get('[data-tab-panel="history"]').textContent).toContain("set Servus");
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

    const text = view.get('[data-tab-panel="history"]').textContent ?? "";
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

  it("focuses Keep editing, not the field, when the prompt opens from History when the prompt opens from History", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();
    typeInto(field(view), "my own words");
    await openHistory(view);
    await clickAsync(view.get("button[data-restore]"));
    await flush();

    expect(document.activeElement?.textContent).toBe("Keep editing");
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

    await clickAsync(view.getByText("button", "Discard draft and restore"));
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
    await later();

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
    await later();

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
    await later();

    expect(view.get("[data-revision-subject]").textContent).toBe("set Servus");
    expect(view.get('[role="alert"]').textContent).toContain("too long");
  });

  it("re-reads when the window is focused again", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await openHistory(view);

    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await later();
    clock.mockRestore();

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

  it("hides the panel of the tab that is not selected and shows the other", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);

    expect(view.get('[data-tab-panel="history"]').hasAttribute("hidden")).toBe(true);
    expect(view.get('[data-tab-panel="locales"]').hasAttribute("hidden")).toBe(false);

    await openHistory(view);

    expect(view.get('[data-tab-panel="locales"]').hasAttribute("hidden")).toBe(true);
    expect(view.get('[data-tab-panel="history"]').hasAttribute("hidden")).toBe(false);
  });

  it("lets a long origin badge wrap inside its cell so it cannot overflow a narrow pane", async () => {
    stubProject(history(revision("a", "Servus")));
    stubRpc({
      "key.value": {
        ok: true,
        result: {
          source: "Hello",
          target: "Hallo",
          provenance: { origin: "external", reviewState: "unreviewed" },
        },
      },
    });
    const view = await renderAsync(<Editor />);

    const origin = view
      .all('[data-locale="de"] [data-tone]')
      .find((badge) => badge.textContent?.includes("Edited outside verbatra"));

    expect(origin?.className).toContain("whitespace-normal");
  });

  it("does not remount the form when the tabs change, so switching tabs never steals focus", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();
    const textarea = field(view);

    act(() => view.get('[data-tab="history"]').focus());
    await openHistory(view);
    act(() => view.get('[data-tab="locales"]').focus());
    await clickAsync(view.get('[data-tab="locales"]'));

    expect(field(view)).toBe(textarea);
    expect(document.activeElement).toBe(view.get('[data-tab="locales"]'));
  });

  it("keeps the arrow keys, Home and End on the tablist while a form is open", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();
    const tabs = (key: string, from: string): void =>
      act(() => {
        view.get(`[data-tab="${from}"]`).focus();
        view
          .get(`[data-tab="${from}"]`)
          .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });

    tabs("ArrowRight", "locales");
    expect(document.activeElement).toBe(view.get('[data-tab="history"]'));
    tabs("ArrowLeft", "history");
    expect(document.activeElement).toBe(view.get('[data-tab="locales"]'));
    tabs("End", "locales");
    expect(document.activeElement).toBe(view.get('[data-tab="history"]'));
    tabs("Home", "history");
    expect(document.activeElement).toBe(view.get('[data-tab="locales"]'));
  });

  it("names what the restore prompt does, and a typed key does not reach the held draft", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();
    typeInto(field(view), "my own words");
    await openHistory(view);

    await clickAsync(view.get("button[data-restore]"));
    await flush();
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "x", bubbles: true }),
      );
    });

    expect(view.get("[data-unsaved-prompt]").textContent).toContain("Restoring replaces them");
    expect(document.activeElement?.textContent).toBe("Keep editing");
    expect(view.getByText("button", "Save draft, then restore")).not.toBeNull();
    expect(view.getByText("button", "Discard draft and restore")).not.toBeNull();
    expect(field(view).value).toBe("my own words");
  });

  it("saves the draft and then restores when the prompt's Save is used", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();
    typeInto(field(view), "my own words");
    await openHistory(view);
    await clickAsync(view.get("button[data-restore]"));
    await flush();

    await clickAsync(view.getByText("button", "Save draft, then restore"));
    await flush();

    const saves = rpcCalls.filter((call) => call.method === "translation.editEntry");
    expect(saves.map((call) => call.params)).toEqual([
      { locale: "de", key: KEY, value: "my own words" },
    ]);
    expect(field(view).value).toBe("Servus");
  });

  it.each(["drawer", "pane"] as const)(
    "cancels only the restore confirm on Escape in the %s",
    async (layout) => {
      stubProject(history(revision("a", "Servus", { sourceChanged: "unknown" })));
      const onClose = vi.fn();
      const view = await renderAsync(<Editor layout={layout} onClose={onClose} />);
      await openHistory(view);
      await clickAsync(view.get("button[data-restore]"));
      expect(view.get("[data-restore-confirm]").getAttribute("data-restore-confirm")).toBe(
        "unknown",
      );

      act(() => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });

      expect(view.query("[data-restore-confirm]")).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(view.get("button[data-restore]"));
    },
  );

  it("keeps the tab, the open confirm, the shown rows and the focus when the editor swaps between pane and drawer", async () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      revision(String.fromCharCode(97 + (index % 26)) + String(index), `v${index}`, {
        commit: `${String(index).padStart(2, "0")}${"c".repeat(38)}`,
        sourceChanged: index === 0 ? true : false,
      }),
    );
    stubProject(history(...rows));
    const view = await renderAsync(<Editor layout="pane" />);
    await openHistory(view);
    await clickAsync(view.get("[data-history-show-more]"));
    await clickAsync(view.all("button[data-restore]")[0] as HTMLElement);
    expect(view.all("[data-revision]")).toHaveLength(30);
    act(() => view.getByText("button", "Load as draft").focus());

    view.rerender(<Editor layout="drawer" />);
    await flush();

    expect(view.get('[data-tab="history"]').getAttribute("aria-selected")).toBe("true");
    expect(view.all("[data-revision]")).toHaveLength(30);
    expect(view.query("[data-restore-confirm]")).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Load as draft");
    expect(historyCalls()).toHaveLength(1);
  });

  it("carries the focus on a tab across the swap", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor layout="pane" />);
    await openHistory(view);
    act(() => view.get('[data-tab="history"]').focus());

    view.rerender(<Editor layout="drawer" />);
    await flush();

    expect(document.activeElement).toBe(view.get('[data-tab="history"]'));
  });

  it("offers no Restore until the current value has been read", async () => {
    stubProject(history(revision("a", "Servus")));
    stubRpc({ "key.value": () => new Promise<StubRpcResult>(() => {}) });
    const view = await renderAsync(<Editor />);

    await openHistory(view);

    expect(view.query("button[data-restore]")).toBeNull();
    expect(view.get('[data-restore-reason="unknown"]').textContent).toContain(
      "once the current value has been read",
    );
  });

  it("says why Restore is unavailable when the key's value could not be read", async () => {
    stubProject(history(revision("a", "Servus")));
    stubRpc({ "key.value": { ok: false, error: { code: "INTERNAL", message: "no value" } } });
    const view = await renderAsync(<Editor />);

    await openHistory(view);

    expect(view.query("button[data-restore]")).toBeNull();
    expect(view.get('[data-restore-reason="unknown"]').textContent).toContain("could not be read");
  });

  it("reads further back at the cap in one step", async () => {
    stubProject((params) => {
      const limit = (params as { limit?: number }).limit;
      return {
        ok: true,
        result: {
          available: true,
          revisions: [revision("a", "Servus")],
          truncated: true,
          truncatedBy: ["commit-limit"],
          unreadableRevisions: 0,
          ...(limit === undefined ? {} : {}),
        },
      };
    });
    const view = await renderAsync(<Editor />);
    await openHistory(view);

    await clickAsync(view.get("[data-read-further]"));
    await flush();

    expect(historyCalls()).toEqual([
      { locale: "de", key: KEY },
      { locale: "de", key: KEY, limit: 200 },
    ]);
    expect(view.query("[data-read-further]")).toBeNull();
    expect(view.get("[data-history-notices]").textContent).toContain("as far as it goes");
  });

  it("reserves the panel height while another locale loads", async () => {
    stubProject((params) =>
      (params as { locale: string }).locale === "de"
        ? history(revision("a", "Servus"))
        : new Promise<StubRpcResult>(() => {}),
    );
    const view = await renderAsync(<Editor locales={[localeDiff("de"), localeDiff("fr")]} />);
    await openHistory(view);
    const panel = view.get("[data-key-history]");
    Object.defineProperty(panel, "offsetHeight", { configurable: true, value: 420 });
    view.rerender(<Editor locales={[localeDiff("de"), localeDiff("fr")]} refreshToken={0} />);

    selectOption(view.get("select[data-history-locale-select]") as HTMLSelectElement, "fr");
    await flush();

    expect(view.get("[data-key-history]").style.minHeight).toBe("420px");
  });

  it("brings the edited locale into view when the restore prompt opens, and keeps focus on Keep editing", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor />);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();
    typeInto(field(view), "my own words");
    await openHistory(view);
    const scrolled = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrolled;
    try {
      await clickAsync(view.get("button[data-restore]"));
      await flush();
    } finally {
      Element.prototype.scrollIntoView = original;
    }

    expect(scrolled.mock.instances).toContain(view.get('[data-locale="de"]'));
    expect(document.activeElement?.textContent).toBe("Keep editing");
  });

  it("does not scroll for a prompt that is not about a restore", async () => {
    stubProject(history(revision("a", "Servus")));
    const view = await renderAsync(<Editor locales={[localeDiff("de"), localeDiff("fr")]} />);
    const scrolled = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrolled;
    try {
      await clickAsync(view.get('button[data-edit-locale="de"]'));
      await flush();
      typeInto(field(view), "my own words");
      await clickAsync(view.get('button[data-edit-locale="fr"]'));
      await flush();
    } finally {
      Element.prototype.scrollIntoView = original;
    }

    expect(view.get("[data-unsaved-prompt]")).not.toBeNull();
    expect(scrolled.mock.instances).not.toContain(view.get('[data-locale="de"]'));
  });
});
