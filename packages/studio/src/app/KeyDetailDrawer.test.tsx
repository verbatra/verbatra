// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../client/diff-view.js";
import type { KeyIntegrityLocaleEntry } from "../client/integrity-pill.js";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { StudioCapabilities } from "../shared/rpc/snapshot.js";
import { KeyDetailDrawer } from "./KeyDetailDrawer.js";
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
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const KEY = "greeting.hello";

function localeDiff(
  locale: string,
  missing: readonly string[],
  changed: readonly string[],
  orphaned: readonly string[] = [],
): DiffLocale {
  return {
    locale,
    missing,
    changed,
    orphaned,
    hasPendingChanges: missing.length > 0 || changed.length > 0,
  };
}

function integrityEntry(
  locale: string,
  overrides: Partial<Omit<KeyIntegrityLocaleEntry, "locale">> = {},
): KeyIntegrityLocaleEntry {
  return {
    locale,
    hasPlaceholders: true,
    matches: true,
    missing: [],
    extra: [],
    icuValid: true,
    markupMatches: true,
    markupDetails: [],
    ...overrides,
  };
}

function integrityResult(
  locales: readonly KeyIntegrityLocaleEntry[],
): RpcResultFor<"key.integrity"> {
  return { locales };
}

function localeOf(params: unknown): string {
  return (params as { readonly locale: string }).locale;
}

function keyValuePerLocale(
  answers: Readonly<Record<string, StubRpcResult>>,
): (params: unknown) => StubRpcResult {
  return (params) =>
    answers[localeOf(params)] ?? rpcError("NO_ANSWER", "no answer for this locale");
}

function value(source: string, target?: string): StubRpcResult {
  return { ok: true, result: target === undefined ? { source } : { source, target } };
}

function capabilities(spend: boolean, writeToDisk: boolean): StubRpcResult {
  const resolved: StudioCapabilities = { spend, writeToDisk };
  return { ok: true, result: { capabilities: resolved } };
}

function stubBackground(): void {
  stubRpc({
    "history.list": { ok: true, result: { available: false } },
    "key.integrity": { ok: true, result: integrityResult([]) },
    "project.snapshot": capabilities(false, false),
  });
}

const DE_CHANGED = localeDiff("de", [], [KEY]);
const FR_MISSING = localeDiff("fr", [KEY], []);

function localeBlocks(view: { all(selector: string): HTMLElement[] }): HTMLElement[] {
  return view.all("ul li");
}

describe("KeyDetailDrawer", () => {
  it("is a modal dialog named after the key it reports on", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    const dialog = view.get('[role="dialog"]');

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe(`Details for ${KEY}`);
  });

  it("shows a loading note for the source value while the value reads are still open", () => {
    stubBackground();
    stubRpc({ "key.value": () => new Promise(() => {}) });

    const view = render(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).toContain("Loading value");
  });

  it("renders the source value once the reads answer", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello there", "Hallo") });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.getByText("p", "Hello there").getAttribute("dir")).toBe("auto");
  });

  it("says there is no source value when every locale's read failed", async () => {
    stubBackground();
    stubRpc({ "key.value": rpcError("KEY_UNKNOWN", "no such key") });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).toContain("No current source value.");
  });

  it("reads the source from the first locale that answered and keeps it across the rest", async () => {
    stubBackground();
    stubRpc({
      "key.value": keyValuePerLocale({
        de: value("Hello", "Hallo"),
        fr: value("Hello", "Bonjour"),
      }),
    });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(view.all("p").filter((node) => node.textContent === "Hello")).toHaveLength(1);
  });

  it("asks for every locale's value once, scoped to this key", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(rpcCalls.filter((call) => call.method === "key.value")).toEqual([
      { method: "key.value", params: { locale: "de", key: KEY } },
      { method: "key.value", params: { locale: "fr", key: KEY } },
    ]);
    expect(rpcCalls).toContainEqual({ method: "key.integrity", params: { key: KEY } });
  });

  it("makes no value call at all when the caller passes no locales", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(rpcCalls.some((call) => call.method === "key.value")).toBe(false);
    expect(localeBlocks(view)).toHaveLength(0);
  });

  it("gives each locale a block carrying its code and its status badge", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[
          DE_CHANGED,
          FR_MISSING,
          localeDiff("es", [], [], [KEY]),
          localeDiff("it", [], []),
        ]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    const badges = localeBlocks(view).map(
      (block) => block.querySelector("span + span")?.textContent,
    );
    expect(badges).toEqual(["Changed", "Missing", "Orphaned", "In sync"]);
  });

  it("renders a locale's current translation, and says so when it has none yet", async () => {
    stubBackground();
    stubRpc({
      "key.value": keyValuePerLocale({ de: value("Hello", "Hallo"), fr: value("Hello") }),
    });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(localeBlocks(view)[0]?.querySelector("p")?.textContent).toBe("Hallo");
    expect(localeBlocks(view)[1]?.querySelector("p")?.textContent).toBe("No translation yet.");
  });

  it("leaves out the value line entirely for a locale whose read failed", async () => {
    stubBackground();
    stubRpc({
      "key.value": keyValuePerLocale({
        de: value("Hello", "Hallo"),
        fr: rpcError("LOCALE_UNREADABLE", "the file is unreadable"),
      }),
    });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(localeBlocks(view)[1]?.querySelector("p")).toBeNull();
  });

  it("spells out a placeholder mismatch, including which tokens differ", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello {{name}}", "Hallo {{nom}}"),
      "key.integrity": {
        ok: true,
        result: integrityResult([
          integrityEntry("de", { matches: false, missing: ["{{name}}"], extra: ["{{nom}}"] }),
        ]),
      },
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).toContain("Placeholder mismatch: missing {{name}}; extra {{nom}}");
  });

  it("reports invalid message syntax without a detail suffix", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello", "Hallo"),
      "key.integrity": {
        ok: true,
        result: integrityResult([integrityEntry("de", { icuValid: false })]),
      },
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.getByText("span", "Invalid message syntax")).toBeTruthy();
  });

  it("marks a key with no placeholders on either side as nothing to check", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello", "Hallo"),
      "key.integrity": {
        ok: true,
        result: integrityResult([integrityEntry("de", { hasPlaceholders: false })]),
      },
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.getByText("span", "No placeholders").className).toContain("text-neutral");
  });

  it("marks a meaningfully checked, matching key as clean", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello {{name}}", "Hallo {{name}}"),
      "key.integrity": { ok: true, result: integrityResult([integrityEntry("de")]) },
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.getByText("span", "Placeholders match").className).toContain("text-success");
  });

  it("shows no pill for a locale the integrity result carries no entry for", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello", "Hallo"),
      "key.integrity": { ok: true, result: integrityResult([integrityEntry("de")]) },
    });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(view.text()).not.toContain("Placeholders match: ");
    expect(localeBlocks(view)[1]?.textContent).toBe("frMissingHallo");
  });

  it("shows no pill at all when the integrity read itself failed", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello", "Hallo"),
      "key.integrity": rpcError("PROJECT_UNREADABLE", "the locale files are unreadable"),
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).not.toContain("Placeholder");
  });

  it("offers a retranslate action only where the integrity pill reports a failure", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": capabilities(true, true),
      "key.value": value("Hello {{name}}", "Hallo"),
      "key.integrity": {
        ok: true,
        result: integrityResult([
          integrityEntry("de", { matches: false, missing: ["{{name}}"] }),
          integrityEntry("fr"),
        ]),
      },
    });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(localeBlocks(view)[0]?.textContent).toContain("Retranslate");
    expect(localeBlocks(view)[1]?.textContent).not.toContain("Retranslate");
  });

  it("hides the retranslate action when the session may not spend", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": capabilities(false, true),
      "key.value": value("Hello {{name}}", "Hallo"),
      "key.integrity": {
        ok: true,
        result: integrityResult([integrityEntry("de", { matches: false, missing: ["{{name}}"] })]),
      },
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).not.toContain("Retranslate");
  });

  it("offers an edit action per locale when the session can write and the caller handles it", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": capabilities(false, true),
      "key.value": value("Hello", "Hallo"),
    });
    const onEditLocale = vi.fn();

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
        onEditLocale={onEditLocale}
      />,
    );
    const editButtons = view.all("li button").filter((button) => button.textContent === "Edit");
    const secondLocaleEdit = editButtons[1];
    if (secondLocaleEdit === undefined) {
      throw new Error("expected an Edit action on every locale block");
    }
    click(secondLocaleEdit);

    expect(editButtons).toHaveLength(2);
    expect(onEditLocale).toHaveBeenCalledWith("fr");
  });

  it("omits the edit action when the caller passes no edit handler", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": capabilities(false, true),
      "key.value": value("Hello", "Hallo"),
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).not.toContain("Edit");
  });

  it("omits the edit action while the capabilities read has not succeeded", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": rpcError("SESSION_EXPIRED", "the session has expired"),
      "key.value": value("Hello", "Hallo"),
    });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[DE_CHANGED]}
        refreshToken={0}
        onClose={vi.fn()}
        onEditLocale={vi.fn()}
      />,
    );

    expect(view.text()).not.toContain("Edit");
  });

  it("closes from the header close button", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={onClose} />,
    );
    click(view.get('button[aria-label="Close"]'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop, which is named after the key it dismisses", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={onClose} />,
    );
    click(view.get(`button[aria-label="Close details for ${KEY}"]`));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });
    const onClose = vi.fn();

    await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={onClose} />,
    );
    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the drawer on open", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(document.activeElement).toBe(view.get('button[aria-label="Close"]'));
  });

  it("re-reads integrity and values when the refresh token changes", async () => {
    stubBackground();
    let target = "Hallo";
    stubRpc({ "key.value": () => value("Hello", target) });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    target = "Guten Tag";
    view.rerender(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={1} onClose={vi.fn()} />,
    );
    await flush();

    expect(localeBlocks(view)[0]?.querySelector("p")?.textContent).toBe("Guten Tag");
    expect(rpcCalls.filter((call) => call.method === "key.integrity")).toHaveLength(2);
  });

  it("ignores a value read that answers after the drawer moved to another key", async () => {
    stubBackground();
    const pending: Array<(result: StubRpcResult) => void> = [];
    stubRpc({
      "key.value": () =>
        new Promise<StubRpcResult>((resolve) => {
          pending.push(resolve);
        }),
    });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName="first.key"
        locales={[DE_CHANGED]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );
    view.rerender(
      <KeyDetailDrawer
        keyName="second.key"
        locales={[DE_CHANGED]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );
    await flush();
    pending[1]?.(value("Second source", "Zweiter Wert"));
    await flush();
    pending[0]?.(value("First source", "Erster Wert"));
    await flush();

    expect(view.text()).toContain("Second source");
    expect(view.text()).not.toContain("First source");
  });

  it("renders a right-to-left locale's block in its own direction", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "مرحبا") });

    const view = await renderAsync(
      <KeyDetailDrawer
        keyName={KEY}
        locales={[localeDiff("ar", [], [KEY]), DE_CHANGED]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(localeBlocks(view)[0]?.getAttribute("dir")).toBe("rtl");
    expect(localeBlocks(view)[1]?.getAttribute("dir")).toBeNull();
  });

  it("shows the project's commit history under its own section", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello", "Hallo"),
      "history.list": {
        ok: true,
        result: {
          available: true,
          commits: [
            {
              hash: "abcdef1234567890",
              authorDate: "2026-08-01T10:00:00+02:00",
              subject: "chore(i18n): sync German",
              touchedPaths: ["locales/de.json"],
            },
          ],
        },
      },
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).toContain("chore(i18n): sync German");
    expect(view.text()).toContain("abcdef1");
  });

  it("keeps the retranslate action wired to the locale and key of its own row", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": capabilities(true, true),
      "key.value": value("Hello {{name}}", "Hallo"),
      "key.integrity": {
        ok: true,
        result: integrityResult([integrityEntry("de", { matches: false, missing: ["{{name}}"] })]),
      },
      "translation.retranslateEntry": { ok: true, result: { accepted: true, value: "Hallo" } },
    });

    const view = await renderAsync(
      <KeyDetailDrawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    await clickAsync(view.getByText("button", "Retranslate"));

    expect(rpcCalls).toContainEqual({
      method: "translation.retranslateEntry",
      params: { locale: "de", key: KEY },
    });
  });
});
