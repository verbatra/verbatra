// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../client/diff-view.js";
import type { KeyIntegrityLocaleEntry } from "../client/integrity-pill.js";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { StudioCapabilities } from "../shared/rpc/snapshot.js";
import { KeyEditor, type KeyEditorProps } from "./KeyEditor.js";
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
    icuArmsMatch: true,
    icuArmDetails: [],
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
    "history.list": { ok: true, result: { available: false, reason: "not-a-repository" } },
    "key.integrity": { ok: true, result: integrityResult([]) },
    "project.snapshot": capabilities(false, false),
  });
}

const DE_CHANGED = localeDiff("de", [], [KEY]);
const FR_MISSING = localeDiff("fr", [KEY], []);

function localeBlocks(view: { all(selector: string): HTMLElement[] }): HTMLElement[] {
  return view.all("ul li");
}

function Drawer(
  props: Omit<
    KeyEditorProps,
    "layout" | "onEscape" | "onRouteSettled" | "missing" | "onDirtyChange"
  >,
): ReactNode {
  return (
    <KeyEditor
      layout="drawer"
      onEscape={() => {}}
      onRouteSettled={() => {}}
      missing={false}
      onDirtyChange={() => {}}
      {...props}
    />
  );
}

describe("KeyEditor drawer", () => {
  it("is a modal dialog named after the key it reports on", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    const dialog = view.get('[role="dialog"]');

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe(`Details for ${KEY}`);
  });

  it("shows a loading note for the source value while the value reads are still open", () => {
    stubBackground();
    stubRpc({ "key.value": () => new Promise(() => {}) });

    const view = render(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).toContain("Loading value");
  });

  it("renders the source value once the reads answer", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello there", "Hallo") });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.getByText("p", "Hello there").getAttribute("dir")).toBe("auto");
  });

  it("isolates placeholders in the source value as left-to-right tokens", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Order #{orderId} is <b>ready</b>", "Hallo") });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.all("bdi[data-value-token]").map((node) => node.textContent)).toContain(
      "#{orderId}",
    );
  });

  it("says the read failed, with a Retry that reads again, when every locale's read failed", async () => {
    stubBackground();
    let answers = 0;
    stubRpc({
      "key.value": () => {
        answers += 1;
        return answers === 1 ? rpcError("KEY_UNKNOWN", "no such key") : value("Hello", "Hallo");
      },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.get('[role="alert"]').textContent).toContain("no such key");
    expect(view.text()).not.toContain("No current source value.");

    await clickAsync(view.getByText("button", "Retry"));
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.text()).toContain("Hello");
    expect(document.activeElement).toBe(view.get('[data-recovery-target="source"]'));
  });

  it("shows one combined error, with one Retry for both reads, when both fail", async () => {
    stubBackground();
    let valueReads = 0;
    let integrityReads = 0;
    stubRpc({
      "key.value": () => {
        valueReads += 1;
        return valueReads === 1 ? rpcError("INTERNAL", "down") : value("Hello", "Hallo");
      },
      "key.integrity": () => {
        integrityReads += 1;
        return integrityReads === 1
          ? rpcError("INTERNAL", "down")
          : { ok: true, result: integrityResult([integrityEntry("de")]) };
      },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.all('[role="alert"]')).toHaveLength(1);
    expect(view.all("button").filter((button) => button.textContent === "Retry")).toHaveLength(1);

    await clickAsync(view.getByText("button", "Retry"));
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(valueReads).toBe(2);
    expect(integrityReads).toBe(2);
    expect(localeBlocks(view)[0]?.textContent).toContain("Placeholders match");
  });

  it("says the integrity read failed, with a Retry that reads again", async () => {
    stubBackground();
    let answers = 0;
    stubRpc({
      "key.value": value("Hello", "Hallo"),
      "key.integrity": () => {
        answers += 1;
        return answers === 1
          ? rpcError("INTERNAL", "integrity is down")
          : { ok: true, result: integrityResult([integrityEntry("de")]) };
      },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.get('[role="alert"]').textContent).toContain("unexpected server error");

    await clickAsync(view.getByText("button", "Retry"));
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(localeBlocks(view)[0]?.textContent).toContain("Placeholders match");
    expect(document.activeElement).toBe(view.get('[data-recovery-target="locales"]'));
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
      <Drawer
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
      <Drawer
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
      <Drawer keyName={KEY} locales={[]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(rpcCalls.some((call) => call.method === "key.value")).toBe(false);
    expect(localeBlocks(view)).toHaveLength(0);
  });

  it("gives each locale a block carrying its code and its status badge", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <Drawer
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
      <Drawer
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
      <Drawer
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
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.getByText("span", "Placeholder mismatch").textContent).toBe("Placeholder mismatch");
    expect(view.get("[data-integrity-detail]").textContent).toBe("missing {{name}}; extra {{nom}}");
  });

  it("keeps the integrity detail out of the pill and lets it wrap as muted text below the row", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("{count, plural, one {# item} other {# items}}", "x"),
      "key.integrity": {
        ok: true,
        result: integrityResult([
          integrityEntry("ar", {
            icuArmsMatch: false,
            icuArmDetails: ["count: missing arms zero, two, few, many"],
          }),
        ]),
      },
    });

    const view = await renderAsync(
      <Drawer
        keyName={KEY}
        locales={[localeDiff("ar", [], [KEY])]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );
    const pill = view.getByText("span", "ICU arms mismatch");
    const detail = view.get("[data-integrity-detail]");

    expect(pill.textContent).toBe("ICU arms mismatch");
    expect(detail.textContent).toBe("count: missing arms zero, two, few, many");
    expect(detail.tagName).toBe("P");
    expect(detail.className).toContain("break-words");
    expect(detail.className).toContain("text-muted-foreground");
    expect(detail.hasAttribute("dir")).toBe(false);
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
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
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
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.getByText("span", "No placeholders").dataset.tone).toBe("neutral");
  });

  it("marks a meaningfully checked, matching key as clean", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello {{name}}", "Hallo {{name}}"),
      "key.integrity": { ok: true, result: integrityResult([integrityEntry("de")]) },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.getByText("span", "Placeholders match").dataset.tone).toBe("success");
  });

  it("shows no pill for a locale the integrity result carries no entry for", async () => {
    stubBackground();
    stubRpc({
      "key.value": value("Hello", "Hallo"),
      "key.integrity": { ok: true, result: integrityResult([integrityEntry("de")]) },
    });

    const view = await renderAsync(
      <Drawer
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
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
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
      <Drawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(localeBlocks(view)[0]?.textContent).toContain("Retranslate");
    expect(localeBlocks(view)[1]?.textContent).not.toContain("Retranslate");
  });

  it("reports an integrity defect in a locale where the key is in sync, with retranslate and edit", async () => {
    stubBackground();
    const { locale: _locale, ...broken } = integrityEntry("de", {
      matches: false,
      missing: ["{{name}}"],
    });
    stubRpc({
      "project.snapshot": capabilities(true, true),
      "key.value": value("Hello {{name}}", "Hallo"),
      "locale.integrity": {
        ok: true,
        result: { locales: [{ locale: "de", entries: [{ key: KEY, ...broken }] }] },
      },
    });

    const view = await renderAsync(
      <Drawer
        keyName={KEY}
        locales={[localeDiff("de", [], [])]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );
    const block = localeBlocks(view)[0];

    expect(block?.textContent).toContain("Placeholder mismatch");
    expect(block?.textContent).toContain("missing {{name}}");
    expect(block?.textContent).toContain("Retranslate");
    expect(block?.textContent).toContain("Edit");
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
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.text()).not.toContain("Retranslate");
  });

  it("offers an edit action per locale when the session can write", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": capabilities(false, true),
      "key.value": value("Hello", "Hallo"),
    });

    const view = await renderAsync(
      <Drawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(view.all("button[data-edit-locale]").map((button) => button.dataset.editLocale)).toEqual(
      ["de", "fr"],
    );
  });

  it("starts on the first control when nothing is being edited", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": capabilities(false, true),
      "key.value": value("Hello", "Hallo"),
    });

    const view = await renderAsync(
      <Drawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    expect(document.activeElement).toBe(view.get("[aria-label^='Close details']"));
  });

  it("omits the edit action while the capabilities read has not succeeded", async () => {
    stubBackground();
    stubRpc({
      "project.snapshot": rpcError("SESSION_EXPIRED", "the session has expired"),
      "key.value": value("Hello", "Hallo"),
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.all("button[data-edit-locale]")).toHaveLength(0);
  });

  it("closes from the header close button", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={onClose} />,
    );
    click(view.get(`button[aria-label="Close details for ${KEY}"]`));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });
    const onClose = vi.fn();

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={onClose} />,
    );
    click(view.get("[data-backdrop]"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });
    const onClose = vi.fn();

    await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={onClose} />,
    );
    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the drawer on open", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(document.activeElement).toBe(view.get(`button[aria-label="Close details for ${KEY}"]`));
  });

  it("re-reads integrity and values when the refresh token changes", async () => {
    stubBackground();
    let target = "Hallo";
    stubRpc({ "key.value": () => value("Hello", target) });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    target = "Guten Tag";
    view.rerender(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={1} onClose={vi.fn()} />,
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
      <Drawer keyName="first.key" locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    view.rerender(
      <Drawer keyName="second.key" locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
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
      <Drawer
        keyName={KEY}
        locales={[localeDiff("ar", [], [KEY]), DE_CHANGED]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );

    const [arBlock, deBlock] = localeBlocks(view);

    expect(arBlock?.hasAttribute("dir")).toBe(false);
    expect(deBlock?.hasAttribute("dir")).toBe(false);
    expect(arBlock?.querySelector("div")?.hasAttribute("dir")).toBe(false);
    expect(view.getByText("p", "مرحبا").getAttribute("dir")).toBe("rtl");
    expect(deBlock?.querySelector("p")?.getAttribute("dir")).toBe("ltr");
  });

  it("isolates placeholders and markup in a right-to-left value as left-to-right tokens", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Order #{orderId}", "طلب #{orderId} <b>جاهز</b>") });

    const view = await renderAsync(
      <Drawer
        keyName={KEY}
        locales={[localeDiff("ar", [], [KEY])]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );
    const valueElement = view.getByText("p", "طلب #{orderId} <b>جاهز</b>");
    const tokens = Array.from(valueElement.querySelectorAll("bdi"));

    expect(valueElement.getAttribute("dir")).toBe("rtl");
    expect(tokens.map((node) => node.textContent)).toEqual(["#{orderId}", "<b>", "</b>"]);
    expect(tokens.every((node) => node.getAttribute("dir") === "ltr")).toBe(true);
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
              author: "Ada Lovelace",
              authorDate: "2026-08-01T10:00:00+02:00",
              subject: "chore(i18n): sync German",
              touchedPaths: ["locales/de.json"],
            },
          ],
        },
      },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
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
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    await clickAsync(view.getByText("button", "Retranslate"));

    expect(rpcCalls).toContainEqual({
      method: "translation.retranslateEntry",
      params: { locale: "de", key: KEY },
    });
  });
});

describe("KeyEditor drawer: provenance", () => {
  it("shows the origin badge and the full record for a locale whose value has one", async () => {
    stubBackground();
    stubRpc({
      "key.value": {
        ok: true,
        result: {
          source: "Hello",
          target: "Hallo",
          provenance: {
            origin: "machine",
            provider: "anthropic",
            model: "claude-sonnet-4-5",
            reviewState: "unreviewed",
          },
        },
      },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    const block = localeBlocks(view)[0];

    expect(block?.querySelectorAll("dt")).toHaveLength(4);
    expect(block?.querySelector("dd")?.textContent).toBe(
      " Origin: Machine. Written by a translation provider.",
    );
    expect(block?.querySelector("dd:nth-of-type(2) .font-mono")?.textContent).toBe("anthropic");
    const terms = [...(block?.querySelectorAll("dt") ?? [])].map((node) => node.textContent);
    const details = [...(block?.querySelectorAll("dd") ?? [])].map((node) => node.textContent);
    expect(terms).toEqual(["Origin", "Provider", "Model", "Review"]);
    expect(details.slice(1)).toEqual(["anthropic", "claude-sonnet-4-5", "Not reviewed"]);
  });

  it("shows no provenance for a locale the server reported none for", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    const block = localeBlocks(view)[0];

    expect(block?.textContent).not.toContain("Origin:");
    expect(block?.querySelector("dl")).toBeNull();
  });
});

describe("KeyEditor drawer: source context", () => {
  it("shows the description the source file gives for the key, as the editor does", async () => {
    stubBackground();
    stubRpc({
      "key.value": {
        ok: true,
        result: { source: "Hello", target: "Hallo", description: "Shown on the home page" },
      },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.get("[data-key-description]").textContent).toBe("Shown on the home page");
  });

  it("leaves the context out when the source file gives no description", async () => {
    stubBackground();
    stubRpc({ "key.value": value("Hello", "Hallo") });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );

    expect(view.query("[data-key-description]")).toBeNull();
  });
});

const NO_GLOSSARY = { terms: [], doNotTranslate: [] };

function context(target?: string, extra: Record<string, unknown> = {}): StubRpcResult {
  return {
    ok: true,
    result: {
      source: "Hello",
      glossary: NO_GLOSSARY,
      ...(target === undefined ? {} : { target }),
      ...extra,
    },
  };
}

function stubWritable(): void {
  stubBackground();
  stubRpc({
    "project.snapshot": capabilities(false, true),
    "key.value": value("Hello", "Hallo"),
  });
}

async function startEditing(
  view: Awaited<ReturnType<typeof renderAsync>>,
  locale = "de",
): Promise<void> {
  await clickAsync(view.get(`button[data-edit-locale="${locale}"]`));
  await flush();
}

function field(view: Awaited<ReturnType<typeof renderAsync>>, locale = "de"): HTMLTextAreaElement {
  const found = view.get(`textarea[aria-label="Translation (${locale})"]`);
  if (!(found instanceof HTMLTextAreaElement)) {
    throw new Error("the translation field is not a textarea");
  }
  return found;
}

describe("KeyEditor editing", () => {
  it("starts an empty draft and says so for a locale with no translation yet", async () => {
    stubWritable();
    stubRpc({ "key.context": context() });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[FR_MISSING]} refreshToken={0} onClose={vi.fn()} />,
    );
    await startEditing(view, "fr");

    expect(view.text()).toContain("No translation exists yet for this locale.");
    expect(field(view, "fr").value).toBe("");
  });

  it("shows an alert with Retry and Cancel, and no field, when the context cannot be read", async () => {
    stubWritable();
    let answers = 0;
    stubRpc({
      "key.context": () => {
        answers += 1;
        return answers === 1 ? rpcError("INTERNAL", "the context is gone") : context("Hallo");
      },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    await startEditing(view);

    expect(view.get('[role="alert"]').textContent).toContain("unexpected server error");
    expect(view.query("textarea")).toBeNull();

    await clickAsync(view.getByText("button", "Retry"));
    await flush();

    expect(field(view).value).toBe("Hallo");
    expect(document.activeElement).toBe(field(view));
  });

  it("closes the form from the Cancel of a failed context read", async () => {
    stubWritable();
    stubRpc({ "key.context": rpcError("INTERNAL", "the context is gone") });
    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    await startEditing(view);

    await clickAsync(view.getByText("button", "Cancel"));

    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.query("button[data-edit-locale]")).not.toBeNull();
  });

  it("lists the glossary terms of the key beside the field, including one with no forbidden rendering", async () => {
    stubWritable();
    stubRpc({
      "key.context": context("Hallo", {
        glossary: {
          terms: [{ source: "Hello", target: "Hallo", forbidden: [], caseSensitive: false }],
          doNotTranslate: [],
        },
      }),
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    await startEditing(view);

    expect(view.get("[data-glossary-hits]").textContent).toContain("Hello");
    expect(view.query("[data-glossary-forbidden]")).toBeNull();
  });

  it("marks the field invalid only while the draft equals a saved value that fails its checks", async () => {
    stubWritable();
    stubRpc({
      "key.context": context("Hallo"),
      "key.integrity": {
        ok: true,
        result: integrityResult([integrityEntry("de", { matches: false, missing: ["{{name}}"] })]),
      },
    });

    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    await startEditing(view);

    expect(field(view).getAttribute("aria-invalid")).toBe("true");

    typeInto(field(view), "Hallo {{name}}");

    expect(field(view).hasAttribute("aria-invalid")).toBe(false);
  });

  it("starts every edit in loading, never showing the value read for an earlier edit of the same locale", async () => {
    stubWritable();
    let reads = 0;
    stubRpc({
      "key.context": () => {
        reads += 1;
        return reads === 1 ? context("Hallo") : new Promise<StubRpcResult>(() => {});
      },
    });
    const view = await renderAsync(
      <Drawer keyName={KEY} locales={[DE_CHANGED]} refreshToken={0} onClose={vi.fn()} />,
    );
    await startEditing(view);
    await clickAsync(view.getByText("button", "Cancel"));

    await startEditing(view);

    expect(view.text()).toContain("Loading current value…");
    expect(view.query("textarea")).toBeNull();
  });

  it("ignores a context read that answers after another locale took over the form", async () => {
    stubWritable();
    const answers = new Map<string, (result: StubRpcResult) => void>();
    stubRpc({
      "key.context": (params) =>
        new Promise<StubRpcResult>((resolve) => {
          answers.set(localeOf(params), resolve);
        }),
    });

    const view = await renderAsync(
      <Drawer
        keyName={KEY}
        locales={[DE_CHANGED, FR_MISSING]}
        refreshToken={0}
        onClose={vi.fn()}
      />,
    );
    await startEditing(view, "de");
    await startEditing(view, "fr");
    await act(async () => {
      answers.get("de")?.(context("Hallo"));
      await Promise.resolve();
    });

    expect(view.text()).toContain("Loading current value…");
    expect(view.query('textarea[aria-label="Translation (de)"]')).toBeNull();

    await act(async () => {
      answers.get("fr")?.(context("Bonjour"));
      await Promise.resolve();
    });

    expect(field(view, "fr").value).toBe("Bonjour");
  });
});
