// @vitest-environment jsdom
import type { IntegrityGateReason } from "@verbatra/sdk";
import { act, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditEntryDialog } from "./EditEntryDialog.js";
import {
  click,
  clickAsync,
  flush,
  pressKey,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  type StubRpcResult,
  stubRpc,
  typeInto,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const LOCALE = "de";
const KEY = "greeting.hello";

function keyValue(source: string, target?: string): StubRpcResult {
  return { ok: true, result: target === undefined ? { source } : { source, target } };
}

function accepted(next: string): StubRpcResult {
  return { ok: true, result: { accepted: true, value: next } };
}

function rejected(reason: IntegrityGateReason, candidate: string): StubRpcResult {
  return { ok: true, result: { accepted: false, reason, value: candidate } };
}

function dialog(onAccepted = vi.fn(), onClose = vi.fn()): ReactElement {
  return (
    <EditEntryDialog locale={LOCALE} keyName={KEY} onClose={onClose} onAccepted={onAccepted} />
  );
}

function editor(view: { get(selector: string): HTMLElement }): HTMLTextAreaElement {
  return view.get("textarea") as HTMLTextAreaElement;
}

function saveButton(view: { getByText(selector: string, text: string): HTMLElement }): HTMLElement {
  return view.getByText("button", "Save");
}

describe("EditEntryDialog", () => {
  it("is a modal dialog naming the key and locale it edits", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    const panel = view.get('[role="dialog"]');

    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.getAttribute("aria-label")).toBe(`Edit ${KEY} in ${LOCALE}`);
  });

  it("shows a loading note and no editor while the current value is still being read", () => {
    stubRpc({ "key.value": () => new Promise(() => {}) });

    const view = render(dialog());

    expect(view.text()).toContain("Loading current value");
    expect(view.query("textarea")).toBeNull();
  });

  it("shows the server's message and no editor when the value read fails", async () => {
    stubRpc({ "key.value": rpcError("KEY_UNKNOWN", "no such key in the source locale") });

    const view = await renderAsync(dialog());

    expect(view.text()).toContain("no such key in the source locale");
    expect(view.query("textarea")).toBeNull();
  });

  it("reads the current value once, for exactly this locale and key", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });

    await renderAsync(dialog());

    expect(rpcCalls).toEqual([{ method: "key.value", params: { locale: LOCALE, key: KEY } }]);
  });

  it("pre-populates the editor with the existing translation and labels it by its source", async () => {
    stubRpc({ "key.value": keyValue("Hello there", "Hallo zusammen") });

    const view = await renderAsync(dialog());

    expect(editor(view).value).toBe("Hallo zusammen");
    expect(editor(view).getAttribute("aria-label")).toBe("Translation for Hello there");
    expect(view.text()).toContain("Hello there");
  });

  it("writes the translation in the locale's own direction", async () => {
    stubRpc({ "key.value": keyValue("Hello {name}", "مرحبا {name}") });

    const arabic = await renderAsync(
      <EditEntryDialog locale="ar" keyName={KEY} onClose={vi.fn()} onAccepted={vi.fn()} />,
    );

    expect(editor(arabic).getAttribute("dir")).toBe("rtl");
  });

  it("writes a left-to-right translation left to right and isolates the source's placeholders", async () => {
    stubRpc({ "key.value": keyValue("Hello {name}", "Hallo {name}") });

    const view = await renderAsync(dialog());

    expect(editor(view).getAttribute("dir")).toBe("ltr");
    expect(view.get("bdi[data-value-token]").textContent).toBe("{name}");
  });

  it("starts empty and says so when the locale has no translation yet", async () => {
    stubRpc({ "key.value": keyValue("Hello") });

    const view = await renderAsync(dialog());

    expect(editor(view).value).toBe("");
    expect(view.text()).toContain("No translation exists yet for this locale.");
  });

  it("re-reads the value when the caller swaps in another locale", async () => {
    stubRpc({
      "key.value": (params) => {
        const { locale } = params as { readonly locale: string };
        return keyValue("Hello", locale === LOCALE ? "Hallo" : "Bonjour");
      },
    });

    const view = await renderAsync(dialog());
    view.rerender(
      <EditEntryDialog locale="fr" keyName={KEY} onClose={vi.fn()} onAccepted={vi.fn()} />,
    );
    await flush();

    expect(editor(view).value).toBe("Bonjour");
  });

  it("sends the edited text under the dialog's own locale and key", async () => {
    stubRpc({
      "key.value": keyValue("Hello", "Hallo"),
      "translation.editEntry": accepted("Guten Tag"),
    });

    const view = await renderAsync(dialog());
    typeInto(editor(view), "Guten Tag");
    await clickAsync(saveButton(view));

    expect(rpcCalls).toContainEqual({
      method: "translation.editEntry",
      params: { locale: LOCALE, key: KEY, value: "Guten Tag" },
    });
  });

  it("reports the edit as saved and tells the caller, once the server accepts it", async () => {
    stubRpc({
      "key.value": keyValue("Hello", "Hallo"),
      "translation.editEntry": accepted("Hallo"),
    });
    const onAccepted = vi.fn();

    const view = await renderAsync(dialog(onAccepted));
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Saved").className).toContain("text-success");
    expect(onAccepted).toHaveBeenCalledWith(LOCALE, KEY);
  });

  it("shows no status label at all before the first save", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());

    expect(view.text()).not.toContain("Saving");
    expect(view.text()).not.toContain("Saved");
  });

  it("disables the editor and the Save action while the write is in flight", async () => {
    stubRpc({
      "key.value": keyValue("Hello", "Hallo"),
      "translation.editEntry": () => new Promise(() => {}),
    });

    const view = await renderAsync(dialog());
    click(saveButton(view));

    expect(view.text()).toContain("Saving");
    expect(saveButton(view).hasAttribute("disabled")).toBe(true);
    expect(editor(view).disabled).toBe(true);
  });

  it("names the failed check when the server rejects the value on placeholders", async () => {
    stubRpc({
      "key.value": keyValue("Hello {{name}}", "Hallo {{name}}"),
      "translation.editEntry": rejected("placeholder", "Hallo {{nom}}"),
    });
    const onAccepted = vi.fn();

    const view = await renderAsync(dialog(onAccepted));
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Rejected: placeholder mismatch").className).toContain(
      "text-danger",
    );
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("names the failed check when the server rejects the value as invalid message syntax", async () => {
    stubRpc({
      "key.value": keyValue("Hello", "Hallo"),
      "translation.editEntry": rejected("icu", "{count, plural,"),
    });

    const view = await renderAsync(dialog());
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Rejected: invalid message syntax")).toBeTruthy();
  });

  it("names the failed check when the server rejects the value as degenerate", async () => {
    stubRpc({
      "key.value": keyValue("Hello", "Hallo"),
      "translation.editEntry": rejected("degenerate", "Hello"),
    });

    const view = await renderAsync(dialog());
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Rejected: degenerate translation")).toBeTruthy();
  });

  it("points an emptied translation at the workbook sentinel, the only way to clear one", async () => {
    stubRpc({
      "key.value": keyValue("Hello", "Hallo"),
      "translation.editEntry": rejected("empty", ""),
    });

    const view = await renderAsync(dialog());
    typeInto(editor(view), "");
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Rejected: empty translation")).toBeTruthy();
    expect(view.text()).toContain("type [[CLEAR]] in its Translation cell");
  });

  it("keeps the clear hint out of every rejection that is not an empty value", async () => {
    stubRpc({
      "key.value": keyValue("Hello", "Hallo"),
      "translation.editEntry": rejected("degenerate", "Hello"),
    });

    const view = await renderAsync(dialog());
    await clickAsync(saveButton(view));

    expect(view.text()).not.toContain("[[CLEAR]]");
  });

  it("surfaces a transport failure as a failed save, distinct from a rejection", async () => {
    stubRpc({
      "key.value": keyValue("Hello", "Hallo"),
      "translation.editEntry": rpcError("LOCALE_UNWRITABLE", "the locale file is read-only"),
    });
    const onAccepted = vi.fn();

    const view = await renderAsync(dialog(onAccepted));
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Failed: the locale file is read-only")).toBeTruthy();
    expect(view.text()).not.toContain("[[CLEAR]]");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("closes from the header close button", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(dialog(vi.fn(), onClose));
    click(view.get('button[aria-label="Close"]'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop, which is named after the editor it dismisses", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(dialog(vi.fn(), onClose));
    click(view.get(`button[aria-label="Close the editor for ${KEY}"]`));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });
    const onClose = vi.fn();

    await renderAsync(dialog(vi.fn(), onClose));
    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the first control inside the dialog on open", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());

    expect(document.activeElement).toBe(view.get('button[aria-label="Close"]'));
  });

  it("wraps Tab from the last control back to the first, keeping focus inside the dialog", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    act(() => {
      saveButton(view).focus();
    });
    pressKey("Tab");

    expect(document.activeElement).toBe(view.get('button[aria-label="Close"]'));
  });

  it("wraps Shift+Tab from the first control back to the last", async () => {
    stubRpc({ "key.value": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    pressKey("Tab", { shiftKey: true });

    expect(document.activeElement).toBe(saveButton(view));
  });

  it("ignores a value read that answers after the dialog moved to another key", async () => {
    const pending: Array<(result: StubRpcResult) => void> = [];
    stubRpc({
      "key.value": () =>
        new Promise<StubRpcResult>((resolve) => {
          pending.push(resolve);
        }),
    });

    const view = await renderAsync(dialog());
    view.rerender(
      <EditEntryDialog
        locale={LOCALE}
        keyName="second.key"
        onClose={vi.fn()}
        onAccepted={vi.fn()}
      />,
    );
    await flush();
    pending[1]?.(keyValue("Second source", "Zweiter Wert"));
    await flush();
    pending[0]?.(keyValue("First source", "Erster Wert"));
    await flush();

    expect(editor(view).value).toBe("Zweiter Wert");
    expect(view.text()).toContain("Second source");
  });
});
