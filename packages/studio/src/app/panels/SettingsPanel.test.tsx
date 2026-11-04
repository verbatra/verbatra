// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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

function snapshotAnswer(result: ProjectSnapshotResult): {
  readonly ok: true;
  readonly result: ProjectSnapshotResult;
} {
  return { ok: true, result };
}

function stubSettings(snapshot: ProjectSnapshotResult): void {
  stubRpc({ "project.snapshot": snapshotAnswer(snapshot) });
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
    expect(view.query("header p")?.textContent).toBe(
      "The configuration this session was started with, and what this session may do.",
    );
  });

  it("shows a loading indicator while the read is still open", () => {
    stubRpc({ "project.snapshot": () => new Promise(() => {}) });

    const view = render(<SettingsPanel />);

    expect(view.get('[role="status"]').textContent?.trim()).toBe("Loading...");
  });

  it("reads only the snapshot, with no parameters, and leaves the glossary to its own page", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(rpcCalls).toEqual([{ method: "project.snapshot", params: {} }]);
    expect(view.text()).not.toContain("Glossary");
    expect(view.query("ul li")).toBeNull();
  });

  it("does not re-read the configuration on a re-render, which is fixed for the session", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);
    view.rerender(<SettingsPanel />);
    await flush();

    expect(rpcCalls).toHaveLength(1);
  });

  it("summarizes the project in the metric strip", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(metricValue(view, "Source locale")).toBe("en");
    expect(metricValue(view, "Target locales")).toBe("2");
    expect(metricCard(view, "Target locales").querySelector("p")?.textContent).toBe("de, fr");
    expect(metricCard(view, "Format").textContent).toContain("i18next-json");
    expect(metricCard(view, "Format").querySelector(".break-all")).not.toBeNull();
    expect(metricValue(view, "Provider")).toBe("anthropic");
  });

  it("names where the configuration was loaded from", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(view.text()).toContain("Loaded from verbatra.config.ts");
  });

  it("lists the file pattern once and the target locales only in the tile", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Target locales")).toBeNull();
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

  it("renders a failed snapshot read as an error, with no configuration shown", async () => {
    stubRpc({ "project.snapshot": rpcError("SESSION_EXPIRED") });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.get('[role="alert"]').textContent?.trim()).toBe(
      "The session has expired. Reload the page to start a new one.",
    );
    expect(view.query("dl")).toBeNull();
  });

  it("ignores answers that arrive after the panel unmounted", async () => {
    let answer: (() => void) | undefined;
    stubRpc({
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
