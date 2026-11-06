// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ICU_PREVIEW_DELAY_MS } from "../client/icu-preview.js";
import { EditEntryDialog } from "./EditEntryDialog.js";
import { IcuPreviewAvailabilityProvider, resetIcuPreviewSession } from "./icu-preview-open.js";
import { KeyEditor, type KeyEditorProps } from "./KeyEditor.js";
import {
  clickAsync,
  flush,
  type RenderResult,
  renderAsync,
  type StubRpcResult,
  stubRpc,
  typeInto,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const KEY = "greeting.hello";
const NO_GLOSSARY = { terms: [], doNotTranslate: [] };

const PREVIEW: StubRpcResult = {
  ok: true,
  result: {
    supported: true,
    valid: true,
    arguments: { style: "named", named: [{ name: "n", type: "number" }] },
    truncated: false,
    rows: [
      {
        axis: "none",
        argument: null,
        category: null,
        sample: null,
        held: {},
        segments: [{ kind: "text", text: "rendered" }],
      },
    ],
  },
};

function stubHost(): void {
  stubRpc({
    "history.list": { ok: true, result: { available: false, reason: "not-a-repository" } },
    "key.integrity": { ok: true, result: { locales: [] } },
    "project.snapshot": {
      ok: true,
      result: {
        sourceLocale: "en",
        icuPreview: true,
        capabilities: { spend: false, writeToDisk: true },
      },
    },
    "key.value": { ok: true, result: { source: "Hello", target: "Hallo" } },
    "key.context": {
      ok: true,
      result: { source: "Hello", target: "Hallo", glossary: NO_GLOSSARY },
    },
    "key.previewIcu": PREVIEW,
  });
}

function editor(
  layout: KeyEditorProps["layout"],
  handlers: { onClose?: () => void; onEscape?: () => void } = {},
): ReactElement {
  return (
    <KeyEditor
      layout={layout}
      keyName={KEY}
      locales={[
        { locale: "de", missing: [], changed: [KEY], orphaned: [], hasPendingChanges: true },
      ]}
      refreshToken={0}
      onClose={handlers.onClose ?? (() => {})}
      onEscape={handlers.onEscape ?? (() => {})}
      onRouteSettled={() => {}}
      missing={false}
      onDirtyChange={() => {}}
    />
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ICU_PREVIEW_DELAY_MS + 50);
  });
}

async function openSampleInKeyEditor(view: RenderResult): Promise<HTMLInputElement> {
  await clickAsync(view.get('button[data-edit-locale="de"]'));
  await flush();
  await clickAsync(view.get("[data-icu-preview] button"));
  await settle();
  return view.get('[data-icu-sample="n"] input') as HTMLInputElement;
}

function escapeOn(element: Element): void {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetIcuPreviewSession();
});

afterEach(() => {
  vi.useRealTimers();
  resetIcuPreviewSession();
});

describe("Escape in a sample input", () => {
  it.each(["drawer", "pane"] as const)(
    "stays in the panel and closes nothing in the %s editor",
    async (layout) => {
      stubHost();
      const onClose = vi.fn();
      const onEscape = vi.fn();
      const view = await renderAsync(editor(layout, { onClose, onEscape }));
      const sample = await openSampleInKeyEditor(view);
      sample.focus();
      typeInto(sample, "12");

      escapeOn(sample);
      await flush();

      expect(onEscape).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(view.query("textarea")).not.toBeNull();
      expect(document.activeElement).toBe(view.get("[data-icu-preview] button"));
      expect((view.get('[data-icu-sample="n"] input') as HTMLInputElement).value).toBe("12");
    },
  );

  it("stays in the panel and closes nothing in the Review dialog", async () => {
    stubHost();
    const onClose = vi.fn();
    const view = await renderAsync(
      <IcuPreviewAvailabilityProvider value={true}>
        <EditEntryDialog locale="de" keyName={KEY} onClose={onClose} onAccepted={() => {}} />
      </IcuPreviewAvailabilityProvider>,
    );
    await clickAsync(view.get("[data-icu-preview] button"));
    await settle();
    const sample = view.get('[data-icu-sample="n"] input') as HTMLInputElement;
    sample.focus();

    escapeOn(sample);
    await flush();

    expect(onClose).not.toHaveBeenCalled();
    expect(view.query('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(view.get("[data-icu-preview] button"));
  });

  it("still closes the dialog on Escape from anywhere else", async () => {
    stubHost();
    const onClose = vi.fn();
    const view = await renderAsync(
      <IcuPreviewAvailabilityProvider value={true}>
        <EditEntryDialog locale="de" keyName={KEY} onClose={onClose} onAccepted={() => {}} />
      </IcuPreviewAvailabilityProvider>,
    );
    const field = view.get("textarea");
    field.focus();

    escapeOn(field);
    await flush();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("samples across the pane and drawer swap", () => {
  it("keep their values, the open panel and the focus with its selection", async () => {
    stubHost();
    const view = await renderAsync(editor("drawer"));
    const sample = await openSampleInKeyEditor(view);
    sample.focus();
    typeInto(sample, "1234");
    sample.setSelectionRange(1, 3);

    view.rerender(editor("pane"));
    await flush();

    const after = view.get('[data-icu-sample="n"] input') as HTMLInputElement;
    expect(after.value).toBe("1234");
    expect(view.get("[data-icu-preview] button").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(after);
    expect([after.selectionStart, after.selectionEnd]).toEqual([1, 3]);
  });

  it("do not pull focus into a sample when focus was elsewhere", async () => {
    stubHost();
    const view = await renderAsync(editor("drawer"));
    await openSampleInKeyEditor(view);
    (view.get("textarea") as HTMLTextAreaElement).focus();

    view.rerender(editor("pane"));
    await flush();

    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });
});

describe("samples across closing the panel", () => {
  it("keep their values when the panel is closed and opened again", async () => {
    stubHost();
    const view = await renderAsync(editor("drawer"));
    const sample = await openSampleInKeyEditor(view);
    typeInto(sample, "7");
    const toggle = view.get("[data-icu-preview] button");

    await clickAsync(toggle);
    await clickAsync(toggle);
    await settle();

    expect((view.get('[data-icu-sample="n"] input') as HTMLInputElement).value).toBe("7");
  });
});
