// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../../client/diff-view.js";
import { AppHeader } from "../AppHeader.js";
import { visibleHash } from "../route-guard.js";
import type { RenderResult, StubRpcResult } from "../test-support.js";
import {
  clickAsync,
  flush,
  render,
  renderAsync,
  resizeViewport,
  rpcCalls,
  selectOption,
  settleHistory as settle,
  stubRpc,
  stubViewport,
  typeInto,
} from "../test-support.js";
import { TranslationsPanel } from "./TranslationsPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const TITLE_HASH = "#/translations?key=app.title";

const LOCALES: readonly DiffLocale[] = ["de", "fr", "ar"].map((locale) => ({
  locale,
  missing: [],
  changed: ["app.title", "app.body"],
  orphaned: [],
  hasPendingChanges: true,
}));

const SOURCE = "Welcome {name}";

let targets: Record<string, string> = {};
let keyGone = false;

const ROLE_SELECTORS = {
  button: "button",
  textbox: "textarea, input:not([type]), input[type=text], input[type=search]",
  combobox: "select",
  link: "a[href]",
  region: "[role=region], section[aria-label]",
  rowheader: "th[scope=row]",
} as const;

function findRole(
  view: RenderResult,
  role: keyof typeof ROLE_SELECTORS,
  name: string | RegExp,
  scope = "",
): HTMLElement | null {
  const root = scope === "" ? view.container : view.get(scope);
  const nameOf = (element: HTMLElement): string =>
    element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
  const found = [...root.querySelectorAll<HTMLElement>(ROLE_SELECTORS[role])].find((element) =>
    typeof name === "string" ? nameOf(element) === name : name.test(nameOf(element)),
  );
  return found ?? null;
}

function getRole(
  view: RenderResult,
  role: keyof typeof ROLE_SELECTORS,
  name: string | RegExp,
  scope = "",
): HTMLElement {
  const found = findRole(view, role, name, scope);
  if (found === null) {
    throw new Error(`no ${role} named ${String(name)}`);
  }
  return found;
}

function modalNodesIn(record: MutationRecord): Element[] {
  const added = [...record.addedNodes].filter(
    (node): node is Element =>
      node instanceof Element &&
      (node.matches("[aria-modal]") || node.querySelector("[aria-modal]") !== null),
  );
  const changed =
    record.attributeName === "aria-modal" && record.target instanceof Element
      ? [record.target]
      : [];
  return [...added, ...changed];
}

function resetTargets(): void {
  keyGone = false;
  targets = { de: "Willkommen {name}", fr: "Bienvenue {name}", ar: "مرحبا {name}" };
}

function localeOf(params: unknown): string {
  return (params as { readonly locale: string }).locale;
}

function stubServer(editEntry?: StubRpcResult): void {
  stubRpc({
    "status.diff": { ok: true, result: { hasPendingChanges: true, locales: LOCALES } },
    "status.check": {
      ok: true,
      result: {
        inSync: false,
        locales: LOCALES.map((entry) => ({
          locale: entry.locale,
          missing: 0,
          stale: 2,
          upToDate: 8,
          inSync: false,
        })),
      },
    },
    "locale.values": () => ({
      ok: true,
      result: LOCALES.map((entry) => ({
        locale: entry.locale,
        values: {
          ...(keyGone ? {} : { "app.title": { source: SOURCE, target: targets[entry.locale] } }),
          "app.body": { source: "Body", target: "Text" },
        },
      })),
    }),
    "review.queue": { ok: true, result: { available: true, locales: [] } },
    "locale.integrity": { ok: true, result: { locales: [] } },
    "key.integrity": { ok: true, result: { locales: [] } },
    "project.snapshot": { ok: true, result: { capabilities: { spend: false, writeToDisk: true } } },
    "history.list": { ok: true, result: { available: false } },
    "key.value": (params) =>
      keyGone
        ? { ok: false, error: { code: "UNKNOWN_KEY", message: "The key was not found." } }
        : { ok: true, result: { source: SOURCE, target: targets[localeOf(params)] } },
    "key.context": (params) => ({
      ok: true,
      result: {
        source: SOURCE,
        target: targets[localeOf(params)],
        glossary: { terms: [], doNotTranslate: [] },
      },
    }),
    "translation.editEntry": editEntry ?? {
      ok: true,
      result: { accepted: true, value: "saved" },
    },
  });
}

function Harness({ token }: { readonly token: number }): ReactNode {
  return (
    <>
      <AppHeader activePage="translations" pageBadges={{}} onOpenMenu={() => {}} />
      <TranslationsPanel refreshToken={token} />
    </>
  );
}

async function mountAt(hash: string, wide: boolean): Promise<RenderResult> {
  stubViewport(wide);
  window.history.replaceState({ idx: 5 }, "", "#/overview");
  window.history.pushState({ idx: 6 }, "", hash);
  const view = await renderAsync(<Harness token={1} />);
  await flush();
  return view;
}

function pane(view: RenderResult, key = "app.title"): HTMLElement {
  return getRole(view, "region", `Editor for ${key}`);
}

function textarea(view: RenderResult): HTMLTextAreaElement {
  const found = getRole(view, "textbox", "Translation (de)");
  if (!(found instanceof HTMLTextAreaElement)) {
    throw new Error("the translation field is not a textarea");
  }
  return found;
}

async function startDirtyEdit(view: RenderResult): Promise<void> {
  await clickAsync(view.get('[data-edit-locale="de"]'));
  await flush();
  typeInto(textarea(view), "Hallo!");
}

function inputNamed(view: RenderResult, name: string): HTMLInputElement {
  const found = getRole(view, "textbox", name);
  if (!(found instanceof HTMLInputElement)) {
    throw new Error(`${name} is not an input`);
  }
  return found;
}

function selectNamed(view: RenderResult, name: string): HTMLSelectElement {
  const found = getRole(view, "combobox", name);
  if (!(found instanceof HTMLSelectElement)) {
    throw new Error(`${name} is not a select`);
  }
  return found;
}

function expectFocusWithin(view: RenderResult, trigger: { readonly focusWithin?: string }): void {
  if (trigger.focusWithin !== undefined) {
    expect(view.get(trigger.focusWithin).contains(document.activeElement)).toBe(true);
  }
}

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    configurable: true,
    writable: true,
  });
  resetTargets();
  confirmSpy = vi.spyOn(window, "confirm");
});

afterEach(() => {
  confirmSpy.mockRestore();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("split editor layout", () => {
  it("renders no modal at any point of an xl deep link", async () => {
    const modalNodes: Element[] = [];
    const inspect = (records: readonly MutationRecord[]): void => {
      modalNodes.push(...records.flatMap(modalNodesIn));
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    stubServer();
    stubViewport(true);
    window.history.replaceState({ idx: 5 }, "", "#/overview");
    window.history.pushState({ idx: 6 }, "", TITLE_HASH);

    const view = render(<Harness token={1} />);
    await flush();
    await flush();
    inspect(observer.takeRecords());
    observer.disconnect();

    expect(pane(view)).not.toBeNull();
    expect(modalNodes).toEqual([]);
    expect(view.query("[aria-modal]")).toBeNull();
    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("puts the table and the editor side by side from xl", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);

    expect(view.query("[data-split]")).not.toBeNull();
    expect(view.get("[data-split]").contains(pane(view))).toBe(true);
    expect(view.get("[data-split]").contains(view.get('[aria-label="Keys table"]'))).toBe(true);
  });

  it("opens the same editor in a modal drawer below xl", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, false);

    expect(view.get('[role="dialog"]').getAttribute("aria-modal")).toBe("true");
    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
    expect(view.query("[data-split]")).toBeNull();
  });

  it("opens the editor beside the table when a row is activated, and marks the row", async () => {
    stubServer();
    const view = await mountAt("#/translations", true);

    await clickAsync(getRole(view, "rowheader", "app.body"));
    await flush();

    expect(pane(view, "app.body")).not.toBeNull();
    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get('[data-key="app.body"]').getAttribute("aria-selected")).toBe("true");
  });

  it("shows the source, every locale with its own direction, and keeps placeholders left to right", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    const arabic = view.get('[data-locale="ar"] [dir="rtl"]');

    expect(view.all("[data-locale]").map((block) => block.dataset.locale)).toEqual([
      "de",
      "fr",
      "ar",
    ]);
    expect(arabic.getAttribute("lang")).toBe("ar");
    expect(arabic.querySelector('bdi[dir="ltr"]')?.textContent).toBe("{name}");
    expect(pane(view).querySelector('bdi[dir="ltr"]')?.textContent).toBe("{name}");
  });

  it("edits a right-to-left locale right to left, with its placeholders isolated in the preview", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);

    await clickAsync(view.get('[data-edit-locale="ar"]'));
    await flush();
    const field = getRole(view, "textbox", "Translation (ar)");

    expect(field.getAttribute("dir")).toBe("rtl");
    expect(field.getAttribute("lang")).toBe("ar");
    expect(view.get("[data-edit-preview]").querySelector('bdi[dir="ltr"]')?.textContent).toBe(
      "{name}",
    );
  });

  it("saves from the keyboard with Ctrl or Cmd and Enter", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    keyDown(textarea(view), { ctrlKey: true });
    await flush();

    expect(rpcCalls.filter((call) => call.method === "translation.editEntry")).toEqual([
      {
        method: "translation.editEntry",
        params: { locale: "de", key: "app.title", value: "Hallo!" },
      },
    ]);
    expect(view.query("[data-locale-edit]")).toBeNull();
    expect(view.get("[data-saved]").textContent).toBe("Saved");
  });

  it("returns focus to the row on Escape and keeps the editor open", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    const closeButton = getRole(view, "button", "Close details for app.title");
    closeButton.focus();

    keyDown(closeButton, { key: "Escape" });

    const rowStops = view.all('[data-key="app.title"] [data-row]');
    expect(rowStops).toContain(document.activeElement);
    expect(pane(view)).not.toBeNull();
  });

  it("keeps the roving position of the table when a row is opened", async () => {
    stubServer();
    const view = await mountAt("#/translations", true);
    const stop = view.get('[data-key="app.body"] [data-row][data-col="1"]');
    stop.focus();

    keyDown(stop, { key: "Enter" });
    await flush();

    expect(document.activeElement).toBe(stop);
    expect(stop.getAttribute("tabindex")).toBe("0");
    expect(pane(view, "app.body")).not.toBeNull();
  });

  it("closes the editor and puts focus on the row it was opened from", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);

    await clickAsync(getRole(view, "button", "Close details for app.title"));

    expect(findRole(view, "region", /^Editor for/)).toBeNull();
    expect(window.location.hash).toBe("#/translations");
    expect(view.all('[data-key="app.title"] [data-row]')).toContain(document.activeElement);
  });

  it("keeps an unsaved draft when the window crosses xl in either direction", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    resizeViewport(false);
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
    expect(textarea(view).value).toBe("Hallo!");

    resizeViewport(true);
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(textarea(view).value).toBe("Hallo!");
  });
});

function keyDown(target: EventTarget, init: KeyboardEventInit): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }),
    );
  });
}

interface Trigger {
  readonly name: string;
  readonly focusWithin?: string;
  readonly fire: (view: RenderResult) => Promise<void>;
  readonly proceeds: (view: RenderResult) => void;
}

const TRIGGERS: readonly Trigger[] = [
  {
    name: "header navigation",
    fire: async (view) => {
      await clickAsync(getRole(view, "link", "Review", "nav"));
    },
    proceeds: () => expect(window.location.hash).toBe("#/review"),
  },
  {
    name: "header search",
    fire: async (view) => {
      typeInto(inputNamed(view, "Search keys and text"), "zzz");
      act(() => inputNamed(view, "Search keys and text").form?.requestSubmit());
      await flush();
    },
    proceeds: () => expect(window.location.hash).toContain("q=zzz"),
  },
  {
    name: "typing in the key filter",
    fire: async (view) => {
      typeInto(inputNamed(view, "Filter by key or translation text"), "x");
      await flush();
    },
    proceeds: () => expect(window.location.hash).toContain("q=x"),
  },
  {
    name: "a status chip",
    focusWithin: '[aria-label="Keys table"]',
    fire: async (view) => {
      await clickAsync(view.get('[data-status-filter="changed"]'));
    },
    proceeds: () => expect(window.location.hash).toContain("status=changed"),
  },
  {
    name: "the locale filter",
    fire: async (view) => {
      selectOption(selectNamed(view, "Filter by locale"), "fr");
      await flush();
    },
    proceeds: () => expect(window.location.hash).toContain("locale=fr"),
  },
  {
    name: "selecting another key",
    focusWithin: '[data-key="app.body"]',
    fire: async (view) => {
      await clickAsync(getRole(view, "rowheader", "app.body"));
    },
    proceeds: () => expect(window.location.hash).toContain("key=app.body"),
  },
  {
    name: "closing the editor",
    focusWithin: '[data-key="app.title"]',
    fire: async (view) => {
      await clickAsync(getRole(view, "button", "Close details for app.title"));
    },
    proceeds: () => expect(window.location.hash).toBe("#/translations"),
  },
  {
    name: "back or forward",
    fire: async () => {
      window.history.back();
      await settle();
      await flush();
    },
    proceeds: () => expect(window.location.hash).toBe("#/overview"),
  },
];

function triggerNamed(name: string): Trigger {
  const found = TRIGGERS.find((trigger) => trigger.name === name);
  if (found === undefined) {
    throw new Error(`no trigger named ${name}`);
  }
  return found;
}

describe("split editor dirty guard", () => {
  it.each(TRIGGERS)("holds the draft and asks before $name", async (trigger) => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    await trigger.fire(view);

    expect(visibleHash()).toBe(TITLE_HASH);
    expect(textarea(view).value).toBe("Hallo!");
    const prompt = view.get("[data-unsaved-prompt]");
    expect(prompt.querySelectorAll("button")).toHaveLength(3);
    expect([...prompt.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Save",
      "Discard",
      "Keep editing",
    ]);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(rpcCalls.some((call) => call.method === "translation.editEntry")).toBe(false);
  });

  it.each(TRIGGERS)("goes on to $name after Discard", async (trigger) => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await trigger.fire(view);

    await clickAsync(getRole(view, "button", "Discard"));
    await settle();
    await flush();

    trigger.proceeds(view);
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(rpcCalls.some((call) => call.method === "translation.editEntry")).toBe(false);
    expectFocusWithin(view, trigger);
  });

  it.each(TRIGGERS)("saves, then goes on to $name, after Save", async (trigger) => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await trigger.fire(view);

    await clickAsync(getRole(view, "button", "Save"));
    await settle();
    await flush();

    expect(rpcCalls.filter((call) => call.method === "translation.editEntry")).toHaveLength(1);
    trigger.proceeds(view);
    expectFocusWithin(view, trigger);
  });

  it("puts focus on Keep editing, never on Save, so a keystroke cannot save by accident", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    typeInto(inputNamed(view, "Filter by key or translation text"), "x");
    await flush();

    expect(document.activeElement?.textContent).toBe("Keep editing");
    expect(rpcCalls.some((call) => call.method === "translation.editEntry")).toBe(false);
  });

  it("keeps the typed header search when the change is held back", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    await triggerNamed("header search").fire(view);

    expect(inputNamed(view, "Search keys and text").value).toBe("zzz");
  });

  it("stays put and keeps the draft on Keep editing, with focus back in the field", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await triggerNamed("selecting another key").fire(view);

    await clickAsync(getRole(view, "button", "Keep editing"));

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(window.location.hash).toBe(TITLE_HASH);
    expect(document.activeElement).toBe(textarea(view));
    expect(textarea(view).value).toBe("Hallo!");
  });

  it("stays on the key when the server rejects the save", async () => {
    stubServer({ ok: true, result: { accepted: false, reason: "placeholder" } });
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await triggerNamed("selecting another key").fire(view);

    await clickAsync(getRole(view, "button", "Save"));
    await flush();

    expect(window.location.hash).toBe(TITLE_HASH);
    expect(textarea(view).value).toBe("Hallo!");
    expect(view.text()).toContain("Rejected: placeholder mismatch");
  });

  it("asks before opening another locale for editing, and opens it after Discard", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    await clickAsync(view.get('[data-edit-locale="fr"]'));

    expect(view.get("[data-unsaved-prompt]")).not.toBeNull();
    expect(textarea(view).value).toBe("Hallo!");

    await clickAsync(getRole(view, "button", "Discard"));
    await flush();

    expect(findRole(view, "textbox", "Translation (de)")).toBeNull();
    expect(getRole(view, "textbox", "Translation (fr)")).not.toBeNull();
  });

  it("does not ask when the form was opened and nothing was typed", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await clickAsync(view.get('[data-edit-locale="de"]'));
    await flush();

    await clickAsync(getRole(view, "rowheader", "app.body"));

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(window.location.hash).toContain("key=app.body");
  });

  it("does not ask once the draft is typed back to the saved value", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    typeInto(textarea(view), "Willkommen {name}");

    await clickAsync(getRole(view, "rowheader", "app.body"));

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(window.location.hash).toContain("key=app.body");
  });

  it("asks before the drawer closes below xl", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, false);
    await startDirtyEdit(view);

    await clickAsync(getRole(view, "button", "Close details for app.title"));

    expect(view.get("[data-unsaved-prompt]")).not.toBeNull();
    expect(window.location.hash).toBe(TITLE_HASH);
    expect(view.get('[role="dialog"]')).not.toBeNull();
  });

  it("closes the drawer once Discard lets the held close through", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, false);
    await startDirtyEdit(view);
    await clickAsync(getRole(view, "button", "Close details for app.title"));

    await clickAsync(getRole(view, "button", "Discard"));
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(window.location.hash).toBe("#/translations");
  });

  it("sends focus back to the control that was used once the held change goes through", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    const chip = view.get('[data-status-filter="changed"]');
    chip.focus();
    await clickAsync(chip);

    await clickAsync(getRole(view, "button", "Discard"));
    await flush();

    expect(document.activeElement).toBe(view.get('[data-status-filter="changed"]'));
  });

  it("asks on Escape below xl instead of dropping the draft", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, false);
    await startDirtyEdit(view);

    keyDown(document, { key: "Escape" });
    await flush();

    expect(view.get("[data-unsaved-prompt]")).not.toBeNull();
    expect(textarea(view).value).toBe("Hallo!");
  });
});

describe("split editor live updates", () => {
  it("reads the context and the integrity of the open key again on every refresh", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await clickAsync(view.get('[data-edit-locale="de"]'));
    await flush();
    const before = (method: string): number =>
      rpcCalls.filter((call) => call.method === method).length;
    const contextReads = before("key.context");
    const integrityReads = before("key.integrity");

    view.rerender(<Harness token={2} />);
    await flush();

    expect(before("key.context")).toBe(contextReads + 1);
    expect(before("key.integrity")).toBe(integrityReads + 1);
  });

  it("replaces a clean draft when the saved value changes on disk", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await clickAsync(view.get('[data-edit-locale="de"]'));
    await flush();
    targets.de = "Servus {name}";

    view.rerender(<Harness token={2} />);
    await flush();

    expect(textarea(view).value).toBe("Servus {name}");
  });

  it("keeps a dirty draft when the saved value changes on disk", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    targets.de = "Servus {name}";

    view.rerender(<Harness token={2} />);
    await flush();

    expect(textarea(view).value).toBe("Hallo!");
  });

  it("starts a fresh draft for the next key", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await clickAsync(view.get('[data-edit-locale="de"]'));
    await flush();

    await clickAsync(getRole(view, "rowheader", "app.body"));
    await flush();

    expect(pane(view, "app.body")).not.toBeNull();
    expect(view.query("[data-locale-edit]")).toBeNull();
    expect(view.query("[data-saved]")).toBeNull();
  });
});

describe("split editor unsaved prompt", () => {
  it("sits in the pane's scroller as a sticky element and scrolls itself into view", async () => {
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scroll,
      configurable: true,
    });
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    await clickAsync(getRole(view, "rowheader", "app.body"));

    const prompt = view.get("[data-unsaved-prompt]");
    const sticky = prompt.closest("[data-sticky]");
    expect(sticky?.closest("[data-editor-scroller]")).not.toBeNull();
    expect(sticky?.contains(prompt)).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("sits in the drawer's sticky header, above the scrolling body", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, false);
    await startDirtyEdit(view);

    await clickAsync(getRole(view, "button", "Close details for app.title"));

    const prompt = view.get("[data-unsaved-prompt]");
    expect(prompt.closest("[data-sheet-banner]")).not.toBeNull();
    expect(prompt.closest("[data-sticky]")?.closest('[role="dialog"]')).not.toBeNull();
  });

  it("makes its Save the only primary action while it is shown", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    const formSave = (): HTMLElement => getRole(view, "button", "Save", "[data-locale-edit]");
    expect(formSave().dataset.variant).toBe("primary");

    await clickAsync(getRole(view, "rowheader", "app.body"));

    expect(getRole(view, "button", "Save", "[data-unsaved-prompt]").dataset.variant).toBe(
      "primary",
    );
    expect(formSave().dataset.variant).toBe("secondary");
  });

  it("goes away on its own when the draft is typed back to the saved value", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await clickAsync(getRole(view, "rowheader", "app.body"));
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();

    typeInto(textarea(view), "Willkommen {name}");
    await flush();

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
  });

  it("keeps the held change, shows why, and keeps focus in the field when the save is rejected", async () => {
    stubServer({ ok: true, result: { accepted: false, reason: "placeholder" } });
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await clickAsync(getRole(view, "rowheader", "app.body"));

    await clickAsync(getRole(view, "button", "Save", "[data-unsaved-prompt]"));
    await settle();
    await flush();

    const prompt = view.get("[data-unsaved-prompt]");
    expect(prompt.querySelector('[role="alert"]')?.textContent).toContain(
      "Rejected: placeholder mismatch",
    );
    expect(window.location.hash).toBe(TITLE_HASH);
    expect(document.activeElement).toBe(textarea(view));

    await clickAsync(getRole(view, "button", "Discard"));
    await settle();

    expect(window.location.hash).toContain("key=app.body");
  });
});

describe("split editor focus across a resize", () => {
  it("puts focus and the selection back in the field after the container changes", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    textarea(view).focus();
    textarea(view).setSelectionRange(1, 3);

    resizeViewport(false);
    await flush();

    expect(document.activeElement).toBe(textarea(view));
    expect([textarea(view).selectionStart, textarea(view).selectionEnd]).toEqual([1, 3]);
  });
});

describe("split editor when its key disappears", () => {
  it("keeps the draft, says the key is gone, and drops it only on Discard", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    keyGone = true;

    view.rerender(<Harness token={2} />);
    await flush();
    await flush();

    expect(textarea(view).value).toBe("Hallo!");
    expect(view.get("[data-key-missing]").textContent).toContain("no longer exists");
    expect(view.query('[data-editor-pane] [role="alert"]')).toBeNull();

    expect(window.location.hash).toContain("key=app.title");
    const length = window.history.length;

    await clickAsync(getRole(view, "button", "Discard", "[data-key-missing]"));
    await flush();

    expect(window.location.hash).toBe("#/translations");
    expect(window.history.length).toBe(length);
    expect(document.activeElement?.closest("tr[data-key]")).not.toBeNull();

    expect(view.query("[data-locale-edit]")).toBeNull();
    expect(view.query("[data-key-missing]")).toBeNull();
    expect(view.query("[data-editor-pane]")).toBeNull();
  });

  it("closes the editor without a notice when the key disappears and nothing is unsaved", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    keyGone = true;

    view.rerender(<Harness token={2} />);
    await flush();
    await flush();

    expect(view.query("[data-editor-pane]")).toBeNull();
    expect(view.query("[data-key-missing]")).toBeNull();
  });
});

describe("history entries", () => {
  it("adds at most one entry for a header search, and Back leaves the page as it was", async () => {
    stubServer();
    const view = await mountAt("#/translations", true);
    const before = window.history.length;
    const hashBefore = window.location.hash;
    const input = inputNamed(view, "Search keys and text");

    typeInto(input, "a");
    typeInto(input, "ab");
    typeInto(input, "abc");
    expect(window.history.length).toBe(before);

    act(() => inputNamed(view, "Search keys and text").form?.requestSubmit());
    await flush();
    expect(window.location.hash).toContain("q=abc");
    expect(window.history.length).toBe(before + 1);

    typeInto(inputNamed(view, "Search keys and text"), "abc");
    act(() => inputNamed(view, "Search keys and text").form?.requestSubmit());
    await flush();
    expect(window.history.length).toBe(before + 1);

    window.history.back();
    await settle();
    await flush();

    expect(window.location.hash).toBe(hashBefore);
    expect(inputNamed(view, "Filter by key or translation text").value).toBe("");
  });

  it("adds no entry while typing in the key filter, a chip, or the locale choice", async () => {
    stubServer();
    const view = await mountAt("#/translations", true);
    const before = window.history.length;

    typeInto(inputNamed(view, "Filter by key or translation text"), "abc");
    await clickAsync(view.get('[data-status-filter="changed"]'));
    selectOption(selectNamed(view, "Filter by locale"), "fr");
    await flush();

    expect(window.location.hash).toContain("q=abc");
    expect(window.location.hash).toContain("locale=fr");
    expect(window.history.length).toBe(before);
  });
});

describe("split editor held history traversals", () => {
  it("puts the address back where it was when Keep editing is chosen after a held Back", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    window.history.back();
    await settle();
    expect(window.location.hash).toBe("#/overview");

    await clickAsync(getRole(view, "button", "Keep editing"));
    await settle();

    expect(window.location.hash).toBe(TITLE_HASH);
    expect(visibleHash()).toBe(TITLE_HASH);
    expect(textarea(view).value).toBe("Hallo!");
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
  });

  it("still restores the traversal when a navigation prompt replaced the traversal prompt", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    window.history.back();
    await settle();
    await clickAsync(getRole(view, "rowheader", "app.body"));

    await clickAsync(getRole(view, "button", "Keep editing"));
    await settle();

    expect(window.location.hash).toBe(TITLE_HASH);
    expect(textarea(view).value).toBe("Hallo!");
  });

  it("reads the new address when focus is returned after Discard on a held Back", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    window.history.back();
    await settle();

    await clickAsync(getRole(view, "button", "Discard"));
    await settle();
    await flush();

    expect(visibleHash()).toBe(window.location.hash);
    expect(window.location.hash).toBe("#/overview");
    expect(view.query("[data-editor-pane]")).toBeNull();
  });
});

describe("split editor layout stability", () => {
  it("keeps the filter bar outside the split, so opening a key never moves the table", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    const filter = getRole(view, "textbox", "Filter by key or translation text");

    expect(view.get("[data-split]").contains(filter)).toBe(false);
    expect(view.get("[data-split]").contains(view.get('[aria-label="Keys table"]'))).toBe(true);
  });
});

describe("split editor focus", () => {
  it("keeps focus in the field through a rejected save started from the keyboard", async () => {
    let answer: (result: StubRpcResult) => void = () => {};
    stubServer();
    stubRpc({
      "translation.editEntry": () =>
        new Promise<StubRpcResult>((resolve) => {
          answer = resolve;
        }),
    });
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    textarea(view).focus();

    keyDown(textarea(view), { ctrlKey: true });
    expect(document.activeElement).toBe(textarea(view));
    expect(textarea(view).readOnly).toBe(true);
    expect(textarea(view).getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      answer({ ok: true, result: { accepted: false, reason: "placeholder" } });
      await Promise.resolve();
    });
    await flush();

    expect(document.activeElement).toBe(textarea(view));
  });

  it("puts focus back in the field after a rejected save started from the Save button", async () => {
    stubServer({ ok: true, result: { accepted: false, reason: "placeholder" } });
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    await clickAsync(getRole(view, "button", "Save", "[data-locale-edit]"));
    await flush();

    expect(document.activeElement).toBe(textarea(view));
  });
});

describe("split editor held Back released", () => {
  it("drops the prompt when the traversal comes back to the entry it left", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    window.history.back();
    await settle();
    expect(view.query("[data-unsaved-prompt]")).not.toBeNull();

    window.history.forward();
    await settle();

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(window.location.hash).toBe(TITLE_HASH);
    expect(textarea(view).value).toBe("Hallo!");
  });
});

describe("split editor close with an empty table", () => {
  it("moves focus to the filter field when no row is left to land on", async () => {
    stubServer();
    const view = await mountAt(`${TITLE_HASH}&q=zzzz`, true);

    await clickAsync(getRole(view, "button", "Close details for app.title"));

    expect(document.activeElement).toBe(
      getRole(view, "textbox", "Filter by key or translation text"),
    );
  });
});

describe("split editor brand link", () => {
  it("goes through the router, so it adds no unstamped entry and never drops a draft", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    const length = window.history.length;

    await clickAsync(getRole(view, "link", "verbatra Studio"));
    await settle();

    expect(window.history.length).toBe(length);
    expect(window.location.hash).toBe(TITLE_HASH);
    expect(textarea(view).value).toBe("Hallo!");
  });
});

describe("split editor saves in flight", () => {
  it("does not close the form of another locale when an earlier save finishes", async () => {
    let answer: (result: StubRpcResult) => void = () => {};
    stubServer();
    stubRpc({
      "translation.editEntry": () =>
        new Promise<StubRpcResult>((resolve) => {
          answer = resolve;
        }),
    });
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await clickAsync(getRole(view, "button", "Save", "[data-locale-edit]"));
    targets.de = "Hallo!";
    view.rerender(<Harness token={2} />);
    await flush();
    await flush();
    await clickAsync(view.get('[data-edit-locale="fr"]'));
    expect(getRole(view, "textbox", "Translation (fr)")).not.toBeNull();

    await act(async () => {
      answer({ ok: true, result: { accepted: true, value: "Hallo!" } });
      await Promise.resolve();
    });
    await flush();

    expect(findRole(view, "textbox", "Translation (fr)")).not.toBeNull();
  });

  it("shows no earlier rejection when a closed form is opened again", async () => {
    stubServer({ ok: true, result: { accepted: false, reason: "placeholder" } });
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await clickAsync(getRole(view, "button", "Save", "[data-locale-edit]"));
    expect(view.text()).toContain("Rejected: placeholder mismatch");
    await clickAsync(getRole(view, "button", "Cancel"));

    await clickAsync(view.get('[data-edit-locale="de"]'));
    await flush();

    expect(view.text()).not.toContain("Rejected");
  });
});
