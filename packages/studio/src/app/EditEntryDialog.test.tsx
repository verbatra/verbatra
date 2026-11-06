// @vitest-environment jsdom
import type { IntegrityGateReason } from "@verbatra/sdk";
import { act, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditEntryDialog } from "./EditEntryDialog.js";
import { IcuPreviewAvailabilityProvider } from "./icu-preview-open.js";
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

  it("offers a Retry that reads the context again after a failed read", async () => {
    let reads = 0;
    stubRpc({
      "key.context": () => {
        reads += 1;
        return reads === 1
          ? rpcError("KEY_UNKNOWN", "no such key in the source locale")
          : keyValue("Hello", "Hallo");
      },
    });
    const view = await renderAsync(dialog());

    await clickAsync(view.getByText("button", "Retry"));
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(editor(view).value).toBe("Hallo");
    expect(document.activeElement).toBe(editor(view));
  });

  it("reads the key's context once, for exactly this locale and key, and its integrity", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    await renderAsync(dialog());

    expect(rpcCalls).toEqual([
      { method: "key.context", params: { locale: LOCALE, key: KEY } },
      { method: "key.integrity", params: { key: KEY } },
      { method: "locale.integrity", params: {} },
    ]);
  });

  it.each([
    ["offered", true],
    ["not offered", false],
  ])(
    "shows the ICU preview in the Review dialog only when the project offers it (%s)",
    async (_name, offered) => {
      stubRpc({ "key.context": keyValue("Hello", "Hallo") });

      const view = await renderAsync(
        <IcuPreviewAvailabilityProvider value={offered}>{dialog()}</IcuPreviewAvailabilityProvider>,
      );

      expect(view.all("[data-icu-preview] button")).toHaveLength(offered ? 1 : 0);
      expect(rpcCalls.some((call) => call.method === "key.previewIcu")).toBe(false);
      expect(editor(view).value).toBe("Hallo");
      expect(view.query('[role="alertdialog"], [data-unsaved-prompt]')).toBeNull();
    },
  );

  it("pre-populates the editor with the existing translation and labels it by its locale", async () => {
    stubRpc({ "key.context": keyValue("Hello there", "Hallo zusammen") });

    const view = await renderAsync(dialog());

    expect(editor(view).value).toBe("Hallo zusammen");
    expect(editor(view).getAttribute("aria-label")).toBe("Translation (de)");
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

  it("locks the editor read-only and busy, and disables Save, while the write is in flight", async () => {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": () => new Promise(() => {}),
    });

    const view = await renderAsync(dialog());
    click(saveButton(view));

    expect(view.text()).toContain("Saving");
    expect(saveButton(view).hasAttribute("disabled")).toBe(true);
    expect(editor(view).readOnly).toBe(true);
    expect(editor(view).getAttribute("aria-busy")).toBe("true");
    expect(editor(view).disabled).toBe(false);
  });

  it("keeps focus in the editor through a rejected save started from the keyboard", async () => {
    let answer: (result: StubRpcResult) => void = () => {};
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": () =>
        new Promise<StubRpcResult>((resolve) => {
          answer = resolve;
        }),
    });
    const view = await renderAsync(dialog());
    editor(view).focus();

    act(() => {
      editor(view).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
      );
    });

    expect(document.activeElement).toBe(editor(view));
    await act(async () => {
      answer({ ok: true, result: { accepted: false, reason: "placeholder" } });
      await Promise.resolve();
    });
    await flush();

    expect(document.activeElement).toBe(editor(view));
  });

  it("puts focus back in the editor after a rejected save started from the Save button", async () => {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": { ok: true, result: { accepted: false, reason: "placeholder" } },
    });
    const view = await renderAsync(dialog());

    await clickAsync(saveButton(view));
    await flush();

    expect(document.activeElement).toBe(editor(view));
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
    click(view.get(`button[aria-label="Close the editor for ${KEY}"]`));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(dialog(vi.fn(), onClose));
    click(view.get("[data-backdrop]"));

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

    expect(document.activeElement).toBe(
      view.get(`button[aria-label="Close the editor for ${KEY}"]`),
    );
  });

  it("wraps Tab from the last control back to the first, keeping focus inside the dialog", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    act(() => {
      saveButton(view).focus();
    });
    pressKey("Tab");

    expect(document.activeElement).toBe(
      view.get(`button[aria-label="Close the editor for ${KEY}"]`),
    );
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
    for (const rule of view.all("[data-glossary-forbidden]")) {
      expect(rule.className).toContain("text-muted-foreground");
      expect(rule.className).not.toContain("text-danger");
    }
  });

  it("checks the draft against the glossary as you type and flags each term", async () => {
    vi.useFakeTimers();
    try {
      const glossary = {
        terms: [
          { source: "cart", target: "Warenkorb", forbidden: ["Karren"], caseSensitive: false },
        ],
        doNotTranslate: [{ term: "Verbatra", caseSensitive: true }],
      };
      stubRpc({
        "key.context": (params) => {
          const draft = (params as { draft?: string }).draft;
          return {
            ok: true,
            result: {
              source: "Your cart at Verbatra",
              target: "Dein Warenkorb bei Verbatra",
              glossary,
              ...(draft === undefined
                ? {}
                : {
                    draftCheck: {
                      terms: [
                        {
                          source: "cart",
                          target: "Warenkorb",
                          targetUsed: draft.includes("Warenkorb"),
                          forbiddenUsed: draft.includes("Karren") ? ["Karren"] : [],
                        },
                      ],
                      doNotTranslate: [{ term: "Verbatra", kept: draft.includes("Verbatra") }],
                    },
                  }),
            },
          };
        },
      });
      const view = await renderAsync(dialog());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      const flags = (): string[] =>
        view.all("[data-draft-flags]").map((node) => node.textContent ?? "");
      expect(flags()).toEqual(["Used", "Kept"]);

      typeInto(editor(view), "Dein Karren bei verbatra");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(flags()).toEqual(["MissingForbidden: Karren", "Missing"]);
      const violation = view
        .all("[data-draft-flags] *")
        .find((node) => node.textContent === "Forbidden: Karren");
      expect(violation?.dataset.tone).toBe("danger");
      expect(view.get("[data-glossary-forbidden]").className).not.toContain("text-danger");
      expect(rpcCalls.at(-1)).toEqual({
        method: "key.context",
        params: { locale: LOCALE, key: KEY, draft: "Dein Karren bei verbatra" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows why the entry was flagged next to the source", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(
      <EditEntryDialog
        locale={LOCALE}
        keyName={KEY}
        onClose={vi.fn()}
        onAccepted={vi.fn()}
        reviewReasons={["GLOSSARY_FORBIDDEN_TERM", "MAX_LENGTH_EXCEEDED"]}
      />,
    );

    expect(view.text()).toContain("Flagged for review");
    expect(view.text()).toContain("Forbidden term used");
    expect(view.text()).toContain("Over length budget");
  });

  it("focuses the translation field when asked to, instead of the first control", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(
      <EditEntryDialog
        locale={LOCALE}
        keyName={KEY}
        onClose={vi.fn()}
        onAccepted={vi.fn()}
        focusTranslation
      />,
    );

    expect(document.activeElement).toBe(editor(view));
  });

  it("highlights the length line once the draft passes the key's budget, and describes the field with it", async () => {
    stubRpc({
      "key.context": {
        ok: true,
        result: { source: "Hello", target: "Hallo", maxLength: 6, glossary: NO_GLOSSARY },
      },
    });

    const view = await renderAsync(dialog());
    const line = view.get("[data-edit-length]");
    expect(editor(view).getAttribute("aria-describedby")).toBe(line.id);
    expect(line.hasAttribute("data-over-budget")).toBe(false);

    typeInto(editor(view), "Hallo zusammen");

    expect(view.get("[data-edit-length]").textContent).toBe(
      "14 of 6 characters, 280% of source, over budget",
    );
    expect(view.get("[data-edit-length]").className).toContain("text-danger");
  });

  it("leaves the glossary section out when no term applies", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());

    expect(view.query("[data-glossary-hits]")).toBeNull();
  });

  it("compares the draft's length with the source's as you type", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    expect(view.get("[data-edit-length]").textContent).toBe("5 characters, 100% of source");

    typeInto(editor(view), "Hallo zusammen");

    expect(view.get("[data-edit-length]").textContent).toBe("14 characters, 280% of source");
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
    expect(editor(view).getAttribute("aria-invalid")).toBe("true");
  });

  it("marks the text area invalid only while the draft equals the failing saved value", async () => {
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
    expect(editor(view).getAttribute("aria-invalid")).toBe("true");

    typeInto(editor(view), "Hallo {name}");
    expect(editor(view).hasAttribute("aria-invalid")).toBe(false);

    typeInto(editor(view), "Hallo");
    expect(editor(view).getAttribute("aria-invalid")).toBe("true");
  });

  it("does not mark the text area invalid while the saved value holds up", async () => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });

    const view = await renderAsync(dialog());
    await flush();

    expect(editor(view).hasAttribute("aria-invalid")).toBe(false);
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

function promptButton(
  view: { get(selector: string): HTMLElement },
  name: "Save" | "Discard" | "Keep editing",
): HTMLElement {
  const found = Array.from(view.get("[data-unsaved-prompt]").querySelectorAll("button")).find(
    (button) => button.textContent === name,
  );
  if (found === undefined) {
    throw new Error(`no ${name} button in the prompt`);
  }
  return found;
}

describe("EditEntryDialog: an unsaved draft", () => {
  const CLOSE = `button[aria-label="Close the editor for ${KEY}"]`;

  async function dirtyDialog(onAccepted = vi.fn(), onClose = vi.fn()) {
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": accepted("Guten Tag"),
    });
    const view = await renderAsync(dialog(onAccepted, onClose));
    typeInto(editor(view), "Guten Tag");
    return view;
  }

  it.each([
    ["Escape", () => pressKey("Escape")],
    ["the backdrop", (view: { get(s: string): HTMLElement }) => click(view.get("[data-backdrop]"))],
    ["the close button", (view: { get(s: string): HTMLElement }) => click(view.get(CLOSE))],
  ])("asks before %s drops it, and keeps the dialog open", async (_name, dismiss) => {
    const onClose = vi.fn();
    const view = await dirtyDialog(vi.fn(), onClose);

    dismiss(view);

    expect(onClose).not.toHaveBeenCalled();
    expect(view.get("[data-unsaved-prompt]").textContent).toContain("not saved");
    expect(editor(view).value).toBe("Guten Tag");
    expect(document.activeElement?.textContent).toBe("Keep editing");
    expect(view.container.contains(document.activeElement)).toBe(true);
  });

  it.each([
    ["Escape", () => pressKey("Escape")],
    ["the backdrop", (view: { get(s: string): HTMLElement }) => click(view.get("[data-backdrop]"))],
    ["the close button", (view: { get(s: string): HTMLElement }) => click(view.get(CLOSE))],
  ])("closes at once on %s while the draft is clean", async (_name, dismiss) => {
    stubRpc({ "key.context": keyValue("Hello", "Hallo") });
    const onClose = vi.fn();
    const view = await renderAsync(dialog(vi.fn(), onClose));

    dismiss(view);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
  });

  it("closes without saving on Discard", async () => {
    const onClose = vi.fn();
    const onAccepted = vi.fn();
    const view = await dirtyDialog(onAccepted, onClose);
    pressKey("Escape");

    click(view.getByText("button", "Discard"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(rpcCalls.some((call) => call.method === "translation.editEntry")).toBe(false);
  });

  it("keeps the draft and returns focus to the field on Keep editing, and on a second Escape", async () => {
    const onClose = vi.fn();
    const view = await dirtyDialog(vi.fn(), onClose);
    pressKey("Escape");

    click(view.getByText("button", "Keep editing"));
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(document.activeElement).toBe(editor(view));

    pressKey("Escape");
    pressKey("Escape");
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(editor(view).value).toBe("Guten Tag");
  });

  it("saves, then reports the edit and closes through the caller, on Save", async () => {
    const onAccepted = vi.fn();
    const view = await dirtyDialog(onAccepted);
    pressKey("Escape");

    await clickAsync(promptButton(view, "Save"));
    await flush();

    expect(rpcCalls).toContainEqual({
      method: "translation.editEntry",
      params: { locale: LOCALE, key: KEY, value: "Guten Tag" },
    });
    expect(onAccepted).toHaveBeenCalledWith(LOCALE, KEY);
  });

  it("keeps the prompt with the reason, and focus in the dialog, when the save is rejected", async () => {
    stubRpc({
      "key.context": keyValue("Hello {name}", "Hallo {name}"),
      "translation.editEntry": rejected("placeholder-mismatch" as IntegrityGateReason, "Hallo"),
    });
    const onAccepted = vi.fn();
    const view = await renderAsync(dialog(onAccepted));
    typeInto(editor(view), "Hallo");
    pressKey("Escape");

    await clickAsync(promptButton(view, "Save"));
    await flush();

    expect(onAccepted).not.toHaveBeenCalled();
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();
    expect(view.container.contains(document.activeElement)).toBe(true);
  });

  it("holds browser Back while dirty and lets it through on Discard", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/review");
    const onClose = vi.fn();
    const view = await dirtyDialog(vi.fn(), onClose);

    act(() => {
      window.history.pushState({ idx: 1 }, "", "#/overview");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    click(view.getByText("button", "Discard"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops the prompt and returns focus to the field when the held route is released", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/review");
    const view = await dirtyDialog();

    act(() => {
      window.history.pushState({ idx: 1 }, "", "#/overview");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();

    act(() => {
      window.history.replaceState({ idx: 0 }, "", "#/review");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(document.activeElement).toBe(editor(view));
  });

  it("drops the prompt and releases a held Back when the draft is typed back to clean", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/review");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const view = await dirtyDialog();
    act(() => {
      window.history.pushState({ idx: 1 }, "", "#/overview");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();

    typeInto(editor(view), "Hallo");

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(go).toHaveBeenCalledWith(-1);
    go.mockRestore();
  });

  it("drops the prompt without a route to restore when the draft is typed back to clean", async () => {
    const view = await dirtyDialog();
    pressKey("Escape");
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();

    typeInto(editor(view), "Hallo");

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
  });

  it("keeps focus on the prompt's Save while the save runs, ignores Discard and close requests, and keeps one primary", async () => {
    const onClose = vi.fn();
    stubRpc({
      "key.context": keyValue("Hello", "Hallo"),
      "translation.editEntry": () => new Promise(() => {}),
    });
    const view = await renderAsync(dialog(vi.fn(), onClose));
    typeInto(editor(view), "Guten Tag");
    pressKey("Escape");
    const save = promptButton(view, "Save");
    save.focus();

    await clickAsync(save);
    click(promptButton(view, "Discard"));
    pressKey("Escape");
    click(view.get("[data-backdrop]"));

    expect(document.activeElement).toBe(save);
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(onClose).not.toHaveBeenCalled();
    const primaries = view
      .all("button")
      .filter((button) => button.textContent === "Save" && button.dataset.variant === "primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toBe(save);
  });

  it("shows a rejection once while the prompt is open, and keeps the field clear of the sticky header", async () => {
    stubRpc({
      "key.context": keyValue("Hello {name}", "Hallo {name}"),
      "translation.editEntry": rejected("placeholder" as IntegrityGateReason, "Hallo"),
    });
    const view = await renderAsync(dialog());
    typeInto(editor(view), "Hallo");
    pressKey("Escape");

    await clickAsync(promptButton(view, "Save"));
    await flush();

    const reason = view.get("[data-unsaved-prompt] [role='alert']").textContent ?? "";
    expect(reason).not.toBe("");
    expect((view.get('[role="dialog"]').textContent ?? "").split(reason).length - 1).toBe(1);
    expect(editor(view).style.getPropertyValue("scroll-margin-top")).toBe("8px");
    expect(document.activeElement).toBe(editor(view));
  });

  it("leaves the field where it is after a rejected save when no prompt is open", async () => {
    stubRpc({
      "key.context": keyValue("Hello {name}", "Hallo {name}"),
      "translation.editEntry": rejected("placeholder" as IntegrityGateReason, "Hallo"),
    });
    const view = await renderAsync(dialog());
    typeInto(editor(view), "Hallo");

    await clickAsync(saveButton(view));
    await flush();

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(editor(view).style.getPropertyValue("scroll-margin-top")).toBe("");
    expect(document.activeElement).toBe(editor(view));
  });

  it("keeps focus on Keep editing when the prompt opens over an earlier rejection", async () => {
    stubRpc({
      "key.context": keyValue("Hello {name}", "Hallo {name}"),
      "translation.editEntry": rejected("placeholder" as IntegrityGateReason, "Hallo"),
    });
    const view = await renderAsync(dialog());
    typeInto(editor(view), "Hallo");
    await clickAsync(saveButton(view));
    await flush();
    expect(view.query("[data-unsaved-prompt]")).toBeNull();

    pressKey("Escape");

    expect(document.activeElement).toBe(promptButton(view, "Keep editing"));
    expect(editor(view).style.getPropertyValue("scroll-margin-top")).toBe("");
  });

  it("reveals the field again when the prompt's own Save is rejected", async () => {
    stubRpc({
      "key.context": keyValue("Hello {name}", "Hallo {name}"),
      "translation.editEntry": rejected("placeholder" as IntegrityGateReason, "Hallo"),
    });
    const view = await renderAsync(dialog());
    typeInto(editor(view), "Hallo");
    pressKey("Escape");

    await clickAsync(promptButton(view, "Save"));
    await flush();

    expect(document.activeElement).toBe(editor(view));
    expect(editor(view).style.getPropertyValue("scroll-margin-top")).toBe("8px");
  });
});
