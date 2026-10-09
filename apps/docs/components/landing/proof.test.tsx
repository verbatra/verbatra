// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GATE_CLI_COMMAND, GATE_REFUSAL_LINE } from "@/lib/gate-demo";
import { HOW_STEP_KEYS } from "@/lib/landing-sections";
import type { TerminalProps } from "./terminal";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const terminals: TerminalProps[] = [];
vi.mock("./terminal", () => ({
  Terminal: (props: TerminalProps) => {
    terminals.push(props);
    return <div data-part="terminal" />;
  },
}));

const { Proof } = await import("./proof");

async function render(): Promise<Document> {
  const html = renderToStaticMarkup(await Proof());
  return new DOMParser().parseFromString(html, "text/html");
}

describe("Proof: the How section", () => {
  it("keeps the real CLI run and the four steps, and no longer ships the three panels", async () => {
    const doc = await render();
    expect(doc.querySelectorAll('[data-part="terminal"]')).toHaveLength(1);
    expect(terminals.at(-1)?.commands).toEqual([GATE_CLI_COMMAND]);
    expect(terminals.at(-1)?.highlight).toBe(GATE_REFUSAL_LINE);
    expect([...doc.querySelectorAll("ol > li h3")].map((h3) => h3.textContent)).toEqual(
      HOW_STEP_KEYS.map((key, index) => `${index + 1}. landing.how.steps.${key}.title`),
    );
    expect(doc.querySelectorAll("dl, pre")).toHaveLength(0);
    const source = readFileSync(join(process.cwd(), "components/landing/proof.tsx"), "utf8");
    expect(source).not.toMatch(/landing\.(proof|gate)|GATE_LOCK|GATE_TARGET/);
    for (const file of ["components/landing/proof.tsx", "app/[lang]/(home)/page.tsx"]) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      expect(text, file).toContain("HOW_STEP_KEYS");
      expect(text, file).not.toContain('"verifyWrite"');
    }
  });
});
