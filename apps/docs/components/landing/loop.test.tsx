// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as sdk from "@verbatra/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SDK_INSTALL_COMMAND, SKILLS_INSTALL_COMMAND } from "@/lib/install-commands";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  getLocale: async () => "de",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/studio-screenshot", () => ({
  StudioScreenshot: ({ shot, alt }: { shot: string; alt: string }) => (
    <figure data-shot={shot} aria-label={alt} />
  ),
}));

const { Loop, LOOP_ROWS, SDK_IMPORT_LINE, SDK_IMPORTS } = await import("./loop");

async function render(): Promise<Document> {
  const markup = renderToStaticMarkup(await Loop());
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("Loop", () => {
  it("shows the Studio, handoff, SDK and agent rows in that order, alternating sides", async () => {
    const doc = await render();
    const rows = Array.from(doc.querySelectorAll<HTMLElement>("[data-loop-row]"));
    expect(rows.map((row) => row.dataset.loopRow)).toEqual([...LOOP_ROWS]);
    expect(rows.map((row) => row.firstElementChild?.classList.contains("lg:order-2"))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    for (const row of rows) expect(row.querySelector("h3")?.className).toContain("vk-h3");
  });

  it("leaves CI to the How section", async () => {
    const doc = await render();
    expect(doc.querySelector('[data-loop-row="ci"]')).toBeNull();
    expect(doc.body.textContent).not.toContain("check --json");
  });

  it("shows a real sdk import line and links the SDK reference", async () => {
    const doc = await render();
    const row = doc.querySelector('[data-loop-row="sdk"]');
    expect(row?.textContent).toContain(SDK_INSTALL_COMMAND);
    expect(row?.querySelector("pre code")?.textContent).toBe(SDK_IMPORT_LINE);
    expect(SDK_IMPORT_LINE).toBe('import { translate, check } from "@verbatra/sdk";');
    const exported: Record<string, unknown> = sdk;
    for (const name of SDK_IMPORTS) expect(typeof exported[name], name).toBe("function");
    expect(row?.querySelector("h3 ~ a")?.getAttribute("href")).toBe("/de/docs/sdk");
  });

  it("shows the Studio review screenshot in its row", async () => {
    const doc = await render();
    const shot = doc.querySelector('[data-loop-row="studio"] figure');
    expect(shot?.getAttribute("data-shot")).toBe("review");
    expect(shot?.getAttribute("aria-label")).toBe("rows.studio.alt");
  });

  it("links every row call to action without a declarative event, which would force a reload", async () => {
    const doc = await render();
    for (const id of LOOP_ROWS) {
      const cta = doc.querySelector<HTMLAnchorElement>(`[data-loop-row="${id}"] h3 ~ a`);
      expect(cta?.getAttribute("href")).toMatch(/^\/de\/docs\//);
      expect(cta?.hasAttribute("data-umami-event")).toBe(false);
    }
  });

  it("installs the skills with the shared command and links llms files, MCP docs, the skills repo and docs", async () => {
    const doc = await render();
    const agent = doc.querySelector('[data-loop-row="agent"]');
    expect(agent?.textContent).toContain(SKILLS_INSTALL_COMMAND);
    const targets = Array.from(agent?.querySelectorAll<HTMLAnchorElement>("p a") ?? []).map(
      (link) => [
        link.dataset.umamiEvent,
        link.dataset.umamiEventTarget,
        link.dataset.umamiEventLocation,
        link.getAttribute("href"),
      ],
    );
    expect(targets).toEqual([
      [undefined, undefined, undefined, "/llms.txt"],
      [undefined, undefined, undefined, "/llms-full.txt"],
      [undefined, undefined, undefined, "/de/docs/cli/mcp"],
      ["outbound-link", "skills-repo", "loop", "https://github.com/verbatra/skills"],
      [undefined, undefined, undefined, "/de/docs/agent-recipes#das-skills-paket"],
    ]);
  });

  it("keeps every command on one scrolling line with Copy beside it", async () => {
    const doc = await render();
    const codes = Array.from(doc.querySelectorAll("#loop code.vk-edge-fade"));
    expect(codes).toHaveLength(5);
    for (const code of codes) expect(code.className).toContain("whitespace-nowrap");
    expect(doc.querySelector("#loop pre")?.className).toContain("vk-terminal-scroll");
  });

  it("lays the rows out as a stack of grids, not a rail", () => {
    const source = readFileSync(join(import.meta.dirname, "loop.tsx"), "utf8");
    expect(source).not.toContain("./rail");
  });
});
