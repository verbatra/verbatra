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

const NO_GLOSSARY = { terms: [], doNotTranslate: [] };

function keyValue(source: string, target?: string): StubRpcResult {
  return {
    ok: true,
    result:
      target === undefined
        ? { source, glossary: NO_GLOSSARY }
        : { source, target, glossary: NO_GLOSSARY },
  };
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
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    const panel = view.get('[role="dialog"]');

    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.getAttribute("aria-label")).toBe(`Edit ${KEY} in ${LOCALE}`);
  });

  it("shows a loading note and no editor while the current value is still being read", () => {
    stubRpc({ "key.context": () => new Promise(() => {}) });

    const view = render(dialog());

    expect(view.text()).toContain("Loading current value");
    expect(view.query("textarea")).toBeNull();
  });

  it("shows the server's message and no editor when the value read fails", async () => {
    stubRpc({ "key.context": rpcError("KEY_UNKNOWN", "no such key in the source locale") });

    const view = await renderAsync(dialog());

    expect(view.text()).toContain("no such key in the source locale");
    expect(view.query("textarea")).toBeNull();
  });

  it("reads the key's context once, for exactly this locale and key, and its integrity", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    await renderAsync(dialog());

    expect(rpcCalls).toEqual([
      { method: "key.context", params: { locale: LOCALE, key: KEY } },
      { method: "key.integrity", params: { key: KEY } },
    ]);
  });

  it("pre-populates the editor with the existing translation and labels it by its source", async () => {
    stubRpc({ "key.context": keyValue("Hello there", "Hallo zusammen") });

    const view = await renderAsync(dialog());

    expect(editor(view).value).toBe("Hallo zusammen");
    expect(editor(view).getAttribute("aria-label")).toBe("Translation for Hello there");
    expect(view.text()).toContain("Hello there");
  });

  it("writes the translation in the locale's own direction", async () => {
    stubRpc({ "key.context": keyValue("Hello {name}", "مرحبا {name}") });

    const arabic = await renderAsync(
      <EditEntryDialog locale="ar" keyName={KEY} onClose={vi.fn()} onAccepted={vi.fn()} />,
    );

    expect(editor(arabic).getAttribute("dir")).toBe("rtl");
  });

  it("shows a labelled, read-only preview under the editor for a right-to-left locale that follows typing", async () => {
    stubRpc({ "key.context": keyValue("Hello {name}", "مرحبا {name}") });

    const view = await renderAsync(
      <EditEntryDialog locale="ps" keyName={KEY} onClose={vi.fn()} onAccepted={vi.fn()} />,
    );
    const preview = view.get("figure[data-edit-preview]");

    expect(preview.querySelector("figcaption")?.textContent).toBe("Preview");
    expect(preview.querySelector("textarea, input")).toBeNull();
    expect(preview.querySelector("p[dir]")?.getAttribute("dir")).toBe("rtl");
    expect(preview.querySelector("bdi")?.textContent).toBe("{name}");

    typeInto(editor(view), "{n, plural, one {# ورځ} other {# ورځې}}");

    const tokens = Array.from(view.get("[data-edit-preview]").querySelectorAll("bdi"));
    expect(tokens.map((node) => node.textContent)).toEqual([
      "{n, plural,",
      "one {",
      "#",
      "} other {",
      "#",
      "}",
      "}",
    ]);
  });

  it("previews a left-to-right value too, with its placeholders highlighted", async () => {
    stubRpc({ "key.context": keyValue("Hello {name}", "Hallo {name}") });

    const view = await renderAsync(dialog());
    const preview = view.get("[data-edit-preview]");

    expect(preview.querySelector("p[dir]")?.getAttribute("dir")).toBe("ltr");
    expect(preview.querySelector("bdi")?.className).toContain("bg-accent");
  });

  it("writes a left-to-right translation left to right and isolates the source's placeholders", async () => {
    stubRpc({ "key.context": keyValue("Hello {name}", "Hallo {name}") });

    const view = await renderAsync(dialog());

    expect(editor(view).getAttribute("dir")).toBe("ltr");
    expect(view.get("[data-edit-source] bdi[data-value-token]").textContent).toBe("{name}");
    expect(view.get("[data-edit-source] bdi").className).toContain("bg-accent");
  });

  it("starts empty and says so when the locale has no translation yet", async () => {
    stubRpc({ "key.context": keyValue("Hello") });

    const view = await renderAsync(dialog());

    expect(editor(view).value).toBe("");
    expect(view.text()).toContain("No translation exists yet for this locale.");
  });

  it("re-reads the value when the caller swaps in another locale", async () => {
    stubRpc({
      "key.context": (params) => {
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
      "key.context": keyValue("Hello", "Hallo"),
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
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": accepted("Hallo"),
    });
    const onAccepted = vi.fn();

    const view = await renderAsync(dialog(onAccepted));
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Saved").className).toContain("text-success");
    expect(onAccepted).toHaveBeenCalledWith(LOCALE, KEY);
  });

  it("shows no status label at all before the first save", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());

    expect(view.text()).not.toContain("Saving");
    expect(view.text()).not.toContain("Saved");
  });

  it("disables the editor and the Save action while the write is in flight", async () => {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
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
      "key.context": keyValue("Hello {{name}}", "Hallo {{name}}"),
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
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": rejected("icu", "{count, plural,"),
    });

    const view = await renderAsync(dialog());
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Rejected: invalid message syntax")).toBeTruthy();
  });

  it("names the failed check when the server rejects the value as degenerate", async () => {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": rejected("degenerate", "Hello"),
    });

    const view = await renderAsync(dialog());
    await clickAsync(saveButton(view));

    expect(view.getByText("span", "Rejected: degenerate translation")).toBeTruthy();
  });

  it("points an emptied translation at the workbook sentinel, the only way to clear one", async () => {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
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
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": rejected("degenerate", "Hello"),
    });

    const view = await renderAsync(dialog());
    await clickAsync(saveButton(view));

    expect(view.text()).not.toContain("[[CLEAR]]");
  });

  it("surfaces a transport failure as a failed save, distinct from a rejection", async () => {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
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
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(dialog(vi.fn(), onClose));
    click(view.get('button[aria-label="Close"]'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop, which is named after the editor it dismisses", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(dialog(vi.fn(), onClose));
    click(view.get(`button[aria-label="Close the editor for ${KEY}"]`));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });
    const onClose = vi.fn();

    await renderAsync(dialog(vi.fn(), onClose));
    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the first control inside the dialog on open", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());

    expect(document.activeElement).toBe(view.get('button[aria-label="Close"]'));
  });

  it("wraps Tab from the last control back to the first, keeping focus inside the dialog", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    act(() => {
      saveButton(view).focus();
    });
    pressKey("Tab");

    expect(document.activeElement).toBe(view.get('button[aria-label="Close"]'));
  });

  it("wraps Shift+Tab from the first control back to the last", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    pressKey("Tab", { shiftKey: true });

    expect(document.activeElement).toBe(saveButton(view));
  });

  it("ignores a value read that answers after the dialog moved to another key", async () => {
    const pending: Array<(result: StubRpcResult) => void> = [];
    stubRpc({
      "key.context": () =>
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

  it("opens as a wide sheet with the source and the translation side by side", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());

    expect(view.get('[role="dialog"]').className).toContain("w-[min(960px,100%)]");
    expect(view.all("h3").map((heading) => heading.textContent)).toEqual(["Source", "Translation"]);
    expect(view.get("[data-edit-source]").closest(".grid")?.className).toContain("md:grid-cols-2");
  });

  it("shows the key's description when the source file gives one", async () => {
    stubRpc({
      "key.context": {
        ok: true,
        result: {
          source: "Hello",
          description: "Greets a returning shopper",
          glossary: NO_GLOSSARY,
        },
      },
    });

    const view = await renderAsync(dialog());

    expect(view.all("h3").map((heading) => heading.textContent)).toEqual([
      "Source",
      "Context",
      "Translation",
    ]);
    expect(view.text()).toContain("Greets a returning shopper");
  });

  it("lists the glossary terms the source uses, with what the locale must and must not use", async () => {
    stubRpc({
      "key.context": {
        ok: true,
        result: {
          source: "Your cart at Verbatra",
          glossary: {
            terms: [
              {
                source: "cart",
                target: "Warenkorb",
                forbidden: ["Karren", "Wagen"],
                caseSensitive: false,
                note: "The shopping basket",
              },
              { source: "order", forbidden: ["Befehl"], caseSensitive: false },
            ],
            doNotTranslate: [{ term: "Verbatra", caseSensitive: true }],
          },
        },
      },
    });

    const view = await renderAsync(dialog());
    const items = view.all("[data-glossary-hits] li").map((item) => item.textContent);

    expect(items).toEqual([
      "cart use WarenkorbNever Karren, WagenThe shopping basket",
      "orderNever Befehl",
      "Verbatra keep as written",
    ]);
  });

  it("leaves the glossary section out when no term applies", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());

    expect(view.query("[data-glossary-hits]")).toBeNull();
  });

  it("compares the draft's length with the source's as you type", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    expect(view.get("[data-edit-length]").textContent).toBe("5 characters, 100% of the source's 5");

    typeInto(editor(view), "Hallo zusammen");

    expect(view.get("[data-edit-length]").textContent).toBe(
      "14 characters, 280% of the source's 5",
    );
  });

  it("shows who wrote the saved value and its integrity verdict", async () => {
    stubRpc({
      "key.context": {
        ok: true,
        result: {
          source: "Hello {name}",
          target: "Hallo",
          provenance: { origin: "machine", provider: "anthropic", reviewState: "unreviewed" },
          glossary: NO_GLOSSARY,
        },
      },
      "key.integrity": {
        ok: true,
        result: {
          locales: [
            {
              locale: LOCALE,
              hasPlaceholders: true,
              matches: false,
              missing: ["{name}"],
              extra: [],
              icuValid: true,
              icuArmsMatch: true,
              icuArmDetails: [],
              markupMatches: true,
              markupDetails: [],
            },
          ],
        },
      },
    });

    const view = await renderAsync(dialog());
    await flush();
    const status = view.get("[data-saved-value-status]");

    expect(status.textContent).toContain("Current value");
    expect(status.textContent).toContain("Machine");
    expect(status.textContent).toContain("Placeholder mismatch");
  });

  it("shows no saved-value status for a key with no translation yet", async () => {
    stubRpc({ "key.context": keyValue("Hello") });

    const view = await renderAsync(dialog());

    expect(view.query("[data-saved-value-status]")).toBeNull();
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Command", { metaKey: true }],
  ] as const)("saves with %s and Enter from the text area", async (_name, modifier) => {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": accepted("Hallo"),
    });
    const onAccepted = vi.fn();
    const view = await renderAsync(dialog(onAccepted));

    act(() => {
      editor(view).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...modifier }),
      );
    });
    await flush();

    expect(onAccepted).toHaveBeenCalledWith(LOCALE, KEY);
  });

  it("leaves a plain Enter to the text area as a new line", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });
    const view = await renderAsync(dialog());

    act(() => {
      editor(view).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();

    expect(rpcCalls.some((call) => call.method === "translation.editEntry")).toBe(false);
  });

  it("ignores the save shortcut while a save is in flight", async () => {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": () => new Promise(() => {}),
    });
    const view = await renderAsync(dialog());
    await clickAsync(saveButton(view));

    act(() => {
      editor(view).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ctrlKey: true }),
      );
    });

    expect(rpcCalls.filter((call) => call.method === "translation.editEntry")).toHaveLength(1);
  });
});
