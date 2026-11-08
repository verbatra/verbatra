// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { KeyRevisionRow } from "../client/key-history.js";
import { EditEntryDialog } from "./EditEntryDialog.js";
import { clickAsync, flush, renderAsync, rpcCalls, stubRpc, typeInto } from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const NO_GLOSSARY = { terms: [], doNotTranslate: [] };

function revision(value: string, overrides: Partial<KeyRevisionRow> = {}): KeyRevisionRow {
  return {
    commit: "c".repeat(40),
    authorDate: "2026-01-02T03:04:05+00:00",
    author: "Ada",
    subject: "earlier",
    value,
    sourceChanged: false,
    diff: [{ kind: "added", text: value }],
    ...overrides,
  };
}

function stubProject(): void {
  stubRpc({
    "key.context": {
      ok: true,
      result: { source: "Hello", target: "Hallo", glossary: NO_GLOSSARY },
    },
    "key.integrity": { ok: true, result: { locales: [] } },
    "project.snapshot": { ok: true, result: { capabilities: { spend: false, writeToDisk: true } } },
    "history.keyRevisions": {
      ok: true,
      result: {
        available: true,
        revisions: [revision("Servus")],
        truncated: false,
        truncatedBy: [],
        unreadableRevisions: 0,
      },
    },
  });
}

function dialog(refreshToken = 0, onClose = vi.fn()): ReturnType<typeof EditEntryDialog> {
  return (
    <EditEntryDialog
      locale="de"
      keyName="greeting"
      refreshToken={refreshToken}
      onClose={onClose}
      onAccepted={vi.fn()}
    />
  );
}

async function later(): Promise<void> {
  await flush();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1600));
  });
}

type View = Awaited<ReturnType<typeof renderAsync>>;

function area(view: View): HTMLTextAreaElement {
  return view.get("textarea") as HTMLTextAreaElement;
}

function calls(): number {
  return rpcCalls.filter((call) => call.method === "history.keyRevisions").length;
}

describe("EditEntryDialog history", () => {
  it("reads the history only after Show history opens it", async () => {
    stubProject();
    const view = await renderAsync(dialog());
    const toggle = view.get("button[data-edit-history-toggle]");

    expect(calls()).toBe(0);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await clickAsync(toggle);
    await flush();

    expect(calls()).toBe(1);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Hide history");
    expect(toggle.getAttribute("aria-controls")).toBe(
      view.get("[data-key-history]").parentElement?.id,
    );

    await clickAsync(toggle);
    expect(view.query("[data-key-history]")).toBeNull();
    expect(toggle.getAttribute("aria-controls")).toBeNull();
  });

  it("loads a restored value into the field and focuses it", async () => {
    stubProject();
    const view = await renderAsync(dialog());
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();

    await clickAsync(view.get("button[data-restore]"));

    expect(area(view).value).toBe("Servus");
    expect(document.activeElement).toBe(area(view));
  });

  it("asks before replacing a dirty draft and keeps it on Keep editing", async () => {
    stubProject();
    const view = await renderAsync(dialog());
    typeInto(area(view), "my words");
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();

    await clickAsync(view.get("button[data-restore]"));

    expect(view.get("[data-unsaved-prompt]").textContent).toContain("Restoring replaces them");
    expect(area(view).value).toBe("my words");

    await clickAsync(view.getByText("button", "Keep editing"));

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(area(view).value).toBe("my words");
    expect(document.activeElement).toBe(view.get("button[data-restore]"));
  });

  it("replaces a dirty draft on Discard", async () => {
    stubProject();
    const view = await renderAsync(dialog());
    typeInto(area(view), "my words");
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();
    await clickAsync(view.get("button[data-restore]"));

    await clickAsync(view.getByText("button", "Discard draft and restore"));

    expect(area(view).value).toBe("Servus");
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
  });

  it("puts the replace prompt in the sticky banner, lowers Save while it shows, and keeps the row where it was", async () => {
    stubProject();
    const view = await renderAsync(dialog());
    typeInto(area(view), "my words");
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();

    await clickAsync(view.get("button[data-restore]"));

    expect(view.get("[data-sticky] [data-unsaved-prompt]")).not.toBeNull();
    expect(view.query("[data-key-history] [data-unsaved-prompt]")).toBeNull();
    expect(view.getByText("button", "Save").getAttribute("data-variant")).toBe("secondary");
    expect(view.getByText("button", "Keep editing").getAttribute("data-variant")).toBe("primary");
  });

  it("closes only the replace prompt on Escape, so prompts never stack", async () => {
    stubProject();
    const onClose = vi.fn();
    const view = await renderAsync(dialog(0, onClose));
    typeInto(area(view), "my words");
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();
    await clickAsync(view.get("button[data-restore]"));

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(area(view).value).toBe("my words");
    expect(document.activeElement).toBe(view.get("button[data-restore]"));
  });

  it("closes only the replace prompt when the dialog's own close is pressed with it open", async () => {
    stubProject();
    const onClose = vi.fn();
    const view = await renderAsync(dialog(0, onClose));
    typeInto(area(view), "my words");
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();
    await clickAsync(view.get("button[data-restore]"));

    await clickAsync(view.get('button[aria-label^="Close the editor"]'));

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks before loading a revision whose source changed, and Cancel returns to its Restore", async () => {
    stubProject();
    stubRpc({
      "history.keyRevisions": {
        ok: true,
        result: {
          available: true,
          revisions: [revision("Servus", { sourceChanged: true })],
          truncated: false,
          truncatedBy: [],
          unreadableRevisions: 0,
        },
      },
    });
    const view = await renderAsync(dialog());
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();

    await clickAsync(view.get("button[data-restore]"));
    expect(view.get("[data-restore-confirm]")).not.toBeNull();
    expect(area(view).value).toBe("Hallo");

    await clickAsync(view.getByText("button", "Cancel"));

    expect(view.query("[data-restore-confirm]")).toBeNull();
    expect(document.activeElement).toBe(view.get("button[data-restore]"));
  });

  it("reads again when the page token moves, so a source that changed is confirmed and never skipped", async () => {
    stubProject();
    let reads = 0;
    stubRpc({
      "history.keyRevisions": () => {
        reads += 1;
        return {
          ok: true,
          result: {
            available: true,
            revisions: [revision("Servus", { sourceChanged: reads > 1 })],
            truncated: false,
            truncatedBy: [],
            unreadableRevisions: 0,
          },
        };
      },
    });
    const view = await renderAsync(dialog(0));
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();
    expect(view.get("[data-revision]").getAttribute("data-source-changed")).toBe("false");

    view.rerender(dialog(1));
    await later();
    await clickAsync(view.get("button[data-restore]"));

    expect(calls()).toBe(2);
    expect(view.get("[data-revision]").getAttribute("data-source-changed")).toBe("true");
    expect(view.get("[data-restore-confirm]")).not.toBeNull();
    expect(area(view).value).toBe("Hallo");
  });
});
