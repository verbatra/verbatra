// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ProjectSnapshotResult } from "../../shared/rpc/snapshot.js";
import type { RenderResult } from "../test-support.js";
import {
  buttonNamed,
  clickAsync,
  flush,
  metricFigure,
  metricHint,
  metricValue,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  stubRpc,
} from "../test-support.js";
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
  icuPreview: false,
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

  it("shows a skeleton of the settings layout while the read is still open", () => {
    stubRpc({ "project.snapshot": () => new Promise(() => {}) });

    const view = render(<SettingsPanel />);

    const status = view.get('[role="status"]');
    expect(status.textContent?.trim()).toBe("Loading the settings");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("data-skeleton")).toBe("settings");
  });

  it("reads only the snapshot, with no parameters, and names the glossary source without its terms", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(rpcCalls).toEqual([{ method: "project.snapshot", params: {} }]);
    expect(detailValue(view, "Glossary")).toBe("file (glossary.json)");
    expect(view.query("ul li")).toBeNull();
  });

  it("shows what the session may do: writing to disk and the rate limits", async () => {
    stubSettings({
      ...SNAPSHOT,
      capabilities: {
        spend: true,
        writeToDisk: false,
        limits: {
          retranslate: { windowMs: 60_000, max: 20 },
          reviewDecision: { windowMs: 120_000, max: 500 },
        },
      },
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Edit translations")).toBe("no");
    expect(detailValue(view, "Edit glossary")).toBe("no");
    expect(detailValue(view, "Retranslate limit")).toBe("20 per minute");
    expect(detailValue(view, "Review decision limit")).toBe("500 per 2 minutes");
  });

  it("states a limit window in seconds when it is not a whole number of minutes", async () => {
    stubSettings({
      ...SNAPSHOT,
      capabilities: {
        spend: false,
        writeToDisk: true,
        limits: {
          retranslate: { windowMs: 1_000, max: 1 },
          reviewDecision: { windowMs: 90_000, max: 3 },
        },
      },
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Edit translations")).toBe("yes");
    expect(detailValue(view, "Edit glossary")).toBe("yes");
    expect(detailValue(view, "Retranslate limit")).toBe("1 per second");
    expect(detailValue(view, "Review decision limit")).toBe("3 per 90 seconds");
  });

  it("names an inline glossary and an absent one by their source", async () => {
    stubSettings({ ...SNAPSHOT, glossary: { source: "inline" } });
    const inline = await renderAsync(<SettingsPanel />);
    expect(detailValue(inline, "Glossary")).toBe("inline");
  });

  it("says translations are editable but an inline or absent glossary is not", async () => {
    stubSettings({ ...SNAPSHOT, glossary: { source: "inline" } });
    const inline = await renderAsync(<SettingsPanel />);
    expect(detailValue(inline, "Edit translations")).toBe("yes");
    expect(detailValue(inline, "Edit glossary")).toBe(
      "no (the glossary is written inline in the config)",
    );

    stubSettings({ ...SNAPSHOT, glossary: { source: "none" } });
    const none = await renderAsync(<SettingsPanel />);
    expect(detailValue(none, "Edit glossary")).toBe("no (there is no glossary file)");
  });

  it("names the policy, not the flag, for provider none even when the server reports no reason", async () => {
    stubSettings({ ...SNAPSHOT, provider: { id: "none" } });

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Provider actions")).toBe(
      "Off (machine translation disabled by policy)",
    );
  });

  it("omits the limit rows when the server reports none", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    expect(detailValue(view, "Retranslate limit")).toBeNull();
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
    expect(metricHint(view, "Target locales")).toBe("de, fr");
    expect(metricValue(view, "Format")).toContain("i18next-json");
    expect(metricValue(view, "Provider")).toBe("anthropic");
  });

  it("sets identifiers in mono, left to right, and only the count as a figure", async () => {
    stubSettings(SNAPSHOT);

    const view = await renderAsync(<SettingsPanel />);

    for (const label of ["Source locale", "Format", "Provider"]) {
      const figure = metricFigure(view, label);
      expect(figure.hasAttribute("data-figure")).toBe(false);
      expect(figure.querySelector("[data-identifier]")?.getAttribute("dir")).toBe("ltr");
    }
    expect(
      metricFigure(view, "Source locale").querySelector("[data-identifier]")?.textContent,
    ).toBe("en");
    expect(metricFigure(view, "Provider").querySelector("[data-identifier]")?.textContent).toBe(
      "anthropic",
    );
    expect(metricFigure(view, "Target locales").hasAttribute("data-figure")).toBe(true);
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

  it("renders a failed snapshot read as an error with Retry, and no configuration shown", async () => {
    stubRpc({ "project.snapshot": rpcError("SESSION_EXPIRED") });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.get('[role="alert"]').textContent).toContain(
      "The session has expired. Reload the page to start a new one.",
    );
    expect(view.query("dl")).toBeNull();
    expect(buttonNamed(view, "Retry")).toBeTruthy();
  });

  it("re-reads on Retry, shows the settings and moves focus to them", async () => {
    let calls = 0;
    stubRpc({
      "project.snapshot": () => (calls++ === 0 ? rpcError("INTERNAL") : snapshotAnswer(SNAPSHOT)),
    });
    const view = await renderAsync(<SettingsPanel />);
    const retry = buttonNamed(view, "Retry");
    retry.focus();

    await clickAsync(retry);

    expect(rpcCalls).toHaveLength(2);
    expect(view.query('[role="alert"]')).toBeNull();
    expect(detailValue(view, "File pattern")).toBe("locales/{locale}.json");
    expect(document.activeElement).toBe(view.get("[data-recovery-target]"));
  });

  it("keeps Retry in place and inert while it runs, and focus there when it fails again", async () => {
    stubRpc({ "project.snapshot": rpcError("INTERNAL") });
    const view = await renderAsync(<SettingsPanel />);
    const retry = buttonNamed(view, "Retry");
    retry.focus();

    await clickAsync(retry);

    expect(rpcCalls).toHaveLength(2);
    expect(view.query("[data-recovery-target]")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(view, "Retry"));
  });

  it("lets a long config path and a long locale list wrap", async () => {
    const path = `${"nested/".repeat(40)}verbatra.config.ts`;
    stubSettings({
      ...SNAPSHOT,
      configSource: path,
      targetLocales: Array.from({ length: 120 }, (_, index) => `xx-${index}`),
    });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.text()).toContain(`Loaded from ${path}`);
    expect(metricHint(view, "Target locales")?.split(", ")).toHaveLength(120);
    expect(view.all("[title]")).toHaveLength(0);
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

  it("keeps the spend flag unbroken and lets the file pattern break after each slash", async () => {
    stubSettings({ ...SNAPSHOT, files: { pattern: "apps/web/locales/{locale}.json" } });

    const view = await renderAsync(<SettingsPanel />);

    expect(view.getByText("span", "--allow-spend")).toBeTruthy();
    expect(detailValue(view, "File pattern")).toBe("apps/web/locales/{locale}.json");
    expect(view.all("dd wbr")).toHaveLength(3);
  });
});
