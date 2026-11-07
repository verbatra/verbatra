// @vitest-environment jsdom
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

function stubProject(writeToDisk = true): void {
  stubRpc({
    "key.context": {
      ok: true,
      result: { source: "Hello", target: "Hallo", glossary: NO_GLOSSARY },
    },
    "key.integrity": { ok: true, result: { locales: [] } },
    "project.snapshot": { ok: true, result: { capabilities: { spend: false, writeToDisk } } },
    "history.keyRevisions": {
      ok: true,
      result: {
        available: true,
        revisions: [revision("Servus")],
        truncated: false,
        unreadableRevisions: 0,
      },
    },
  });
}

function dialog(): ReturnType<typeof EditEntryDialog> {
  return <EditEntryDialog locale="de" keyName="greeting" onClose={vi.fn()} onAccepted={vi.fn()} />;
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
    expect(document.activeElement).toBe(area(view));
  });

  it("replaces a dirty draft on Discard", async () => {
    stubProject();
    const view = await renderAsync(dialog());
    typeInto(area(view), "my words");
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();
    await clickAsync(view.get("button[data-restore]"));

    await clickAsync(view.getByText("button", "Discard"));

    expect(area(view).value).toBe("Servus");
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
  });

  it("offers no Restore when the project cannot be written", async () => {
    stubProject(false);
    const view = await renderAsync(dialog());
    await clickAsync(view.get("button[data-edit-history-toggle]"));
    await flush();

    expect(view.query("button[data-restore]")).toBeNull();
    expect(view.get('[data-restore-reason="unavailable"]')).not.toBeNull();
  });
});
