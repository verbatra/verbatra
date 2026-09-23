// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import type { ProjectSnapshotResult } from "../../shared/rpc/snapshot.js";
import type { RenderResult } from "../test-support.js";
import { flush, render, renderAsync, rpcCalls, rpcError, stubRpc } from "../test-support.js";
import { SettingsPanel } from "./SettingsPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const SNAPSHOT: ProjectSnapshotResult = {
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic" },
  configSource: "verbatra.config.ts",
  glossary: { source: "file", path: "glossary.json" },
  capabilities: { spend: false, writeToDisk: true },
  exposeAgentTools: false,
};

const GLOSSARY: GlossaryGetResult = {
  indicator: { source: "file", path: "glossary.json" },
  entries: { verbatra: "Verbatra", checkout: "Kasse" },
  redactedTerms: [],
};

function snapshotAnswer(result: ProjectSnapshotResult): {
  readonly ok: true;
  readonly result: ProjectSnapshotResult;
} {
  return { ok: true, result };
}

function glossaryAnswer(result: GlossaryGetResult): {
  readonly ok: true;
  readonly result: GlossaryGetResult;
} {
  return { ok: true, result };
}

function stubSettings(
  snapshot: ProjectSnapshotResult,
  glossary: GlossaryGetResult = GLOSSARY,
): void {
  stubRpc({
    "project.snapshot": snapshotAnswer(snapshot),
    "glossary.get": glossaryAnswer(glossary),
  });
}

function metricCard(view: RenderResult, label: string): HTMLElement {
  const card = view.getByText("span", label).parentElement?.parentElement;
  if (card === null || card === undefined) {
    throw new Error(`no metric card is labeled ${JSON.stringify(label)}`);
  }
  return card;
}

function metricValue(view: RenderResult, label: string): string | null {
  return metricCard(view, label).querySelector("div[title]")?.getAttribute("title") ?? null;
}

function detailValue(view: RenderResult, label: string): string | null {
  const term = view.all("dt").find((node) => node.textContent?.trim() === label);
  return term?.nextElementSibling?.textContent ?? null;
}

describe("SettingsPanel", () => {
  it("names the page in its header", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(view.get("h1").textContent).toBe("Settings");
    expect(view.getByText("p", "Project configuration")).toBeTruthy();
  });

  it("shows a loading indicator while the two reads are still open", () => {
    stubRpc({
      "project.snapshot": () => new Promise(() => {}),
      "glossary.get": () => new Promise(() => {}),
    });

    const view = render(<SettingsPanel />);

    expect(view.get('[role="status"]').textContent?.trim()).toBe("Loading...");
  });

  it("reads the snapshot and the glossary once each, with no parameters", async () => {
    stubSettings(SNAPSHOT);

    await renderAsync(<SettingsPanel />);

    expect(rpcCalls).toEqual([
      { method: "project.snapshot", params: {} },
      { method: "glossary.get", params: {} },
    ]);
  });

  it("does not re-read the configuration on a re-render, which is fixed for the session", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);
    view.rerender(<SettingsPanel />);
    await flush();

    expect(rpcCalls).toHaveLength(2);
  });

  it("summarizes the project in the metric strip", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(metricValue(view, "Source locale")).toBe("en");
    expect(metricValue(view, "Target locales")).toBe("2");
    expect(metricCard(view, "Target locales").querySelector("p")?.textContent).toBe("de, fr");
    expect(metricValue(view, "Format")).toBe("i18next-json");
    expect(metricValue(view, "Provider")).toBe("anthropic");
  });

  it("names where the configuration was loaded from", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(view.text()).toContain("Loaded from verbatra.config.ts");
  });

  it("lists the full target locale list and the file pattern", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Target locales")).toBe("de, fr");
    expect(detailValue(view, "File pattern")).toBe("locales/{locale}.json");
  });

  it("points at the flag when provider actions were refused at startup", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Provider actions")).toBe("Off (start with --allow-spend)");
  });

  it("names the policy rather than the flag when machine translation is disabled", async () => {
    stubSettings({
      ...SNAPSHOT,
      provider: { id: "none" },
      capabilities: { spend: false, spendWithheld: "policy", writeToDisk: true },
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Provider actions")).toBe(
      "Off (machine translation disabled by policy)",
    );
  });

  it("marks provider actions enabled when the session was started with spend allowed", async () => {
    stubSettings({ ...SNAPSHOT, capabilities: { spend: true, writeToDisk: true } });

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Provider actions")).toBe("Enabled");
  });

  it("omits every optional configuration row the config never set", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Prune")).toBeNull();
    expect(detailValue(view, "Generate plurals")).toBeNull();
    expect(detailValue(view, "Max batch size")).toBeNull();
    expect(detailValue(view, "Tone")).toBeNull();
  });

  it("renders the optional rows the config did set", async () => {
    stubSettings({
      ...SNAPSHOT,
      prune: true,
      generatePlurals: false,
      maxBatchSize: 25,
      tone: "formal",
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Prune")).toBe("yes");
    expect(detailValue(view, "Generate plurals")).toBe("no");
    expect(detailValue(view, "Max batch size")).toBe("25");
    expect(detailValue(view, "Tone")).toBe("formal");
  });

  it("renders an explicitly disabled boolean setting as no rather than omitting it", async () => {
    stubSettings({ ...SNAPSHOT, prune: false, generatePlurals: true, tone: "informal" });

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Prune")).toBe("no");
    expect(detailValue(view, "Generate plurals")).toBe("yes");
    expect(detailValue(view, "Tone")).toBe("informal");
  });

  it("lists the glossary terms with their translations, direction inferred per value", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);
    const terms = view.all("ul li");

    expect(terms).toHaveLength(2);
    expect(terms[1]?.textContent).toContain("checkout");
    expect(terms[1]?.textContent).toContain("Kasse");
    expect(view.all('p[dir="auto"]').map((node) => node.textContent)).toEqual([
      "Verbatra",
      "Kasse",
    ]);
  });

  it("counts the glossary terms in a badge, pluralized", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(view.text()).toContain("2 terms");
  });

  it("uses the singular term label for a one-entry glossary", async () => {
    stubSettings(SNAPSHOT, {
      indicator: { source: "inline" },
      entries: { verbatra: "Verbatra" },
      redactedTerms: [],
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.text()).toContain("1 term");
    expect(view.text()).not.toContain("1 terms");
  });

  it("shows an empty state and no count badge when no glossary is configured", async () => {
    stubSettings(SNAPSHOT, { indicator: { source: "none" }, entries: {}, redactedTerms: [] });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.text()).toContain("No glossary configured");
    expect(view.query(".bg-neutral-soft")).toBeNull();
    expect(view.query("ul li")).toBeNull();
  });

  it("names a file-backed glossary's path as its source", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(view.text()).toContain("Source: file (glossary.json)");
  });

  it("names an inline glossary's source without a path", async () => {
    stubSettings(SNAPSHOT, {
      indicator: { source: "inline" },
      entries: { verbatra: "Verbatra" },
      redactedTerms: [],
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.text()).toContain("Source: inline");
  });

  it("renders a failed snapshot read as an error, with no configuration shown", async () => {
    stubRpc({
      "project.snapshot": rpcError("SESSION_EXPIRED"),
      "glossary.get": glossaryAnswer(GLOSSARY),
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.get('[role="alert"]').textContent?.trim()).toBe(
      "The session has expired. Reload the page to start a new one.",
    );
    expect(view.query("dl")).toBeNull();
  });

  it("renders a failed glossary read as an error even when the snapshot succeeded", async () => {
    stubRpc({
      "project.snapshot": snapshotAnswer(SNAPSHOT),
      "glossary.get": rpcError("GLOSSARY_UNREADABLE", "the glossary file could not be read"),
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.get('[role="alert"]').textContent?.trim()).toBe(
      "the glossary file could not be read",
    );
    expect(view.query("dl")).toBeNull();
  });

  it("ignores answers that arrive after the panel unmounted", async () => {
    let answer: (() => void) | undefined;
    stubRpc({
      "glossary.get": glossaryAnswer(GLOSSARY),
      "project.snapshot": () =>
        new Promise((resolve) => {
          answer = () => {
            resolve(snapshotAnswer(SNAPSHOT));
          };
        }),
    });

    const view = render(<SettingsPanel />);
    view.unmount();
    answer?.();
    await flush();

    expect(view.container.textContent).toBe("");
  });
});
