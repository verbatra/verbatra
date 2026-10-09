// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SKILLS_INSTALL_COMMAND } from "@/lib/install-commands";

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

const { Loop, LOOP_ROWS } = await import("./loop");

async function render(): Promise<Document> {
  const markup = renderToStaticMarkup(await Loop());
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("Loop", () => {
  it("shows the Excel, Studio, CI and agent rows in that order, alternating sides", async () => {
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

  it("shows the Studio review screenshot in its row", async () => {
    const doc = await render();
    const shot = doc.querySelector('[data-loop-row="studio"] figure');
    expect(shot?.getAttribute("data-shot")).toBe("review");
    expect(shot?.getAttribute("aria-label")).toBe("rows.studio.alt");
  });

  it("counts every row call to action as a loop click naming its row", async () => {
    const doc = await render();
    for (const id of LOOP_ROWS) {
      const cta = doc.querySelector<HTMLAnchorElement>(`[data-loop-row="${id}"] h3 ~ a`);
      expect(cta?.dataset.umamiEvent).toBe("click-cta");
      expect(cta?.dataset.umamiEventLocation).toBe("loop");
      expect(cta?.dataset.umamiEventTarget).toBe(id);
    }
  });

  it("installs the skills with the shared command and links llms files, MCP docs, the skills repo and docs", async () => {
    const doc = await render();
    const agent = doc.querySelector('[data-loop-row="agent"]');
    expect(agent?.textContent).toContain(SKILLS_INSTALL_COMMAND);
    const targets = Array.from(
      agent?.querySelectorAll<HTMLAnchorElement>("p a[data-umami-event]") ?? [],
    ).map((link) => [
      link.dataset.umamiEvent,
      link.dataset.umamiEventTarget,
      link.dataset.umamiEventLocation,
      link.getAttribute("href"),
    ]);
    expect(targets).toEqual([
      ["click-cta", "llms", "loop", "/llms.txt"],
      ["click-cta", "llms-full", "loop", "/llms-full.txt"],
      ["click-cta", "mcp-docs", "loop", "/de/docs/cli/mcp"],
      ["outbound-link", "skills-repo", "loop", "https://github.com/verbatra/skills"],
      ["click-cta", "skills-docs", "loop", "/de/docs/agent-recipes#das-skills-paket"],
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
