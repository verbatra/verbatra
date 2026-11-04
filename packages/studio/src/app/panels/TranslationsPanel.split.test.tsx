// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../../client/diff-view.js";
import { AppHeader } from "../AppHeader.js";
import type { RenderResult, StubRpcResult } from "../test-support.js";
import {
  clickAsync,
  flush,
  render,
  renderAsync,
  resizeViewport,
  rpcCalls,
  selectOption,
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

function resetTargets(): void {
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
    "locale.values": {
      ok: true,
      result: LOCALES.map((entry) => ({
        locale: entry.locale,
        values: {
          "app.title": { source: SOURCE, target: targets[entry.locale] },
          "app.body": { source: "Body", target: "Text" },
        },
      })),
    },
    "review.queue": { ok: true, result: { available: true, locales: [] } },
    "locale.integrity": { ok: true, result: { locales: [] } },
    "key.integrity": { ok: true, result: { locales: [] } },
    "project.snapshot": { ok: true, result: { capabilities: { spend: false, writeToDisk: true } } },
    "history.list": { ok: true, result: { available: false } },
    "key.value": (params) => ({
      ok: true,
      result: { source: SOURCE, target: targets[localeOf(params)] },
    }),
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
  window.history.replaceState(null, "", hash);
  const view = await renderAsync(<Harness token={1} />);
  await flush();
  return view;
}

function pane(view: RenderResult, key = "app.title"): HTMLElement {
  return view.get(`section[aria-label="Editor for ${key}"]`);
}

function textarea(view: RenderResult): HTMLTextAreaElement {
  const found = view.get('textarea[aria-label="Translation (de)"]');
  if (!(found instanceof HTMLTextAreaElement)) {
    throw new Error("the translation field is not a textarea");
  }
  return found;
}

async function startDirtyEdit(view: RenderResult): Promise<void> {
  await clickAsync(view.get('button[data-edit-locale="de"]'));
  await flush();
  typeInto(textarea(view), "Hallo!");
}

function nextHashChange(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener("hashchange", () => resolve(), { once: true });
  });
}

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetTargets();
  confirmSpy = vi.spyOn(window, "confirm");
});

afterEach(() => {
  confirmSpy.mockRestore();
});

describe("split editor layout", () => {
  it("renders no modal at any point of an xl deep link", async () => {
    const seen: Element[] = [];
    const observer = new MutationObserver(() => {
      seen.push(...document.body.querySelectorAll("[aria-modal]"));
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    stubServer();
    stubViewport(true);
    window.history.replaceState(null, "", TITLE_HASH);

    const view = render(<Harness token={1} />);
    seen.push(...document.body.querySelectorAll("[aria-modal]"));
    await flush();
    await flush();
    observer.takeRecords();
    observer.disconnect();

    expect(pane(view)).not.toBeNull();
    expect(seen).toEqual([]);
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

    await clickAsync(view.get('[data-key="app.body"] th'));
    await flush();

    expect(pane(view, "app.body")).not.toBeNull();
    expect(view.query('[role="dialog"]')).toBeNull();
    expect(view.get('[data-key="app.body"]').getAttribute("aria-selected")).toBe("true");
  });

  it("shows the source, every locale with its own direction, and keeps placeholders left to right", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    const arabic = view.get('li[data-locale="ar"] [dir="rtl"]');

    expect(view.all("li[data-locale]").map((block) => block.dataset.locale)).toEqual([
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

    await clickAsync(view.get('button[data-edit-locale="ar"]'));
    await flush();
    const field = view.get('textarea[aria-label="Translation (ar)"]');

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
    expect(view.query("textarea")).toBeNull();
    expect(view.get("[data-saved]").textContent).toBe("Saved");
  });

  it("returns focus to the row on Escape and keeps the editor open", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    const closeButton = view.get('button[aria-label="Close details for app.title"]');
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

    await clickAsync(view.get('button[aria-label="Close details for app.title"]'));

    expect(view.query('section[aria-label^="Editor for"]')).toBeNull();
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
  readonly fire: (view: RenderResult) => Promise<void>;
  readonly proceeds: (view: RenderResult) => void;
}

const TRIGGERS: readonly Trigger[] = [
  {
    name: "header navigation",
    fire: async (view) => {
      await clickAsync(view.get('nav a[href="#/review"]'));
    },
    proceeds: () => expect(window.location.hash).toBe("#/review"),
  },
  {
    name: "header search",
    fire: async (view) => {
      typeInto(
        view.get('search input[aria-label="Search keys and text"]') as HTMLInputElement,
        "zzz",
      );
      act(() => (view.get("search form") as HTMLFormElement).requestSubmit());
      await flush();
    },
    proceeds: () => expect(window.location.hash).toContain("q=zzz"),
  },
  {
    name: "a status chip",
    fire: async (view) => {
      await clickAsync(view.get('[data-status-filter="changed"]'));
    },
    proceeds: () => expect(window.location.hash).toContain("status=changed"),
  },
  {
    name: "the locale filter",
    fire: async (view) => {
      selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, "fr");
      await flush();
    },
    proceeds: () => expect(window.location.hash).toContain("locale=fr"),
  },
  {
    name: "selecting another key",
    fire: async (view) => {
      await clickAsync(view.get('[data-key="app.body"] th'));
    },
    proceeds: () => expect(window.location.hash).toContain("key=app.body"),
  },
  {
    name: "closing the editor",
    fire: async (view) => {
      await clickAsync(view.get('button[aria-label="Close details for app.title"]'));
    },
    proceeds: () => expect(window.location.hash).toBe("#/translations"),
  },
  {
    name: "back or forward",
    fire: async () => {
      const changed = nextHashChange();
      window.location.hash = "#/overview";
      await changed;
      await flush();
    },
    proceeds: () => expect(window.location.hash).toBe("#/overview"),
  },
];

describe("split editor dirty guard", () => {
  it.each(TRIGGERS)("holds the draft and asks before $name", async (trigger) => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    await trigger.fire(view);

    expect(window.location.hash).toBe(TITLE_HASH);
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

    await clickAsync(view.getByText("button", "Discard"));
    await flush();

    trigger.proceeds(view);
    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(rpcCalls.some((call) => call.method === "translation.editEntry")).toBe(false);
  });

  it.each(TRIGGERS)("saves, then goes on to $name, after Save", async (trigger) => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await trigger.fire(view);

    await clickAsync(view.getByText("button", "Save"));
    await flush();

    expect(rpcCalls.filter((call) => call.method === "translation.editEntry")).toHaveLength(1);
    trigger.proceeds(view);
  });

  it("keeps the typed header search when the change is held back", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    await TRIGGERS[1]?.fire(view);

    expect(
      (view.get('search input[aria-label="Search keys and text"]') as HTMLInputElement).value,
    ).toBe("zzz");
  });

  it("stays put and keeps the draft on Keep editing, with focus back in the field", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await TRIGGERS[4]?.fire(view);

    await clickAsync(view.getByText("button", "Keep editing"));

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(window.location.hash).toBe(TITLE_HASH);
    expect(document.activeElement).toBe(textarea(view));
    expect(textarea(view).value).toBe("Hallo!");
  });

  it("stays on the key when the server rejects the save", async () => {
    stubServer({ ok: true, result: { accepted: false, reason: "placeholder" } });
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    await TRIGGERS[4]?.fire(view);

    await clickAsync(view.getByText("button", "Save"));
    await flush();

    expect(window.location.hash).toBe(TITLE_HASH);
    expect(textarea(view).value).toBe("Hallo!");
    expect(view.text()).toContain("Rejected: placeholder mismatch");
  });

  it("asks before opening another locale for editing, and opens it after Discard", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);

    await clickAsync(view.get('button[data-edit-locale="fr"]'));

    expect(view.get("[data-unsaved-prompt]")).not.toBeNull();
    expect(textarea(view).value).toBe("Hallo!");

    await clickAsync(view.getByText("button", "Discard"));
    await flush();

    expect(view.query('textarea[aria-label="Translation (de)"]')).toBeNull();
    expect(view.get('textarea[aria-label="Translation (fr)"]')).not.toBeNull();
  });

  it("does not ask when the form was opened and nothing was typed", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();

    await clickAsync(view.get('[data-key="app.body"] th'));

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(window.location.hash).toContain("key=app.body");
  });

  it("does not ask once the draft is typed back to the saved value", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, true);
    await startDirtyEdit(view);
    typeInto(textarea(view), "Willkommen {name}");

    await clickAsync(view.get('[data-key="app.body"] th'));

    expect(view.query("[data-unsaved-prompt]")).toBeNull();
    expect(window.location.hash).toContain("key=app.body");
  });

  it("asks before the drawer closes below xl", async () => {
    stubServer();
    const view = await mountAt(TITLE_HASH, false);
    await startDirtyEdit(view);

    await clickAsync(view.get('button[aria-label="Close details for app.title"]'));

    expect(view.get("[data-unsaved-prompt]")).not.toBeNull();
    expect(window.location.hash).toBe(TITLE_HASH);
    expect(view.get('[role="dialog"]')).not.toBeNull();
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
    await clickAsync(view.get('button[data-edit-locale="de"]'));
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
    await clickAsync(view.get('button[data-edit-locale="de"]'));
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
    await clickAsync(view.get('button[data-edit-locale="de"]'));
    await flush();

    await clickAsync(view.get('[data-key="app.body"] th'));
    await flush();

    expect(pane(view, "app.body")).not.toBeNull();
    expect(view.query("textarea")).toBeNull();
    expect(view.query("[data-saved]")).toBeNull();
  });
});
