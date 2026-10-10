// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CHECK_CLI_COMMAND } from "@/lib/check-demo";
import { GATE_CLI_COMMAND, GATE_REFUSAL_LINE } from "@/lib/gate-demo";
import { HOW_COMMANDS, HOW_LINE_DELAY_MS, HOW_OUTPUTS, HOW_TITLE } from "@/lib/how-steps";
import { HOW_STEP_KEYS } from "@/lib/landing-sections";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
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
  it("replays translate then check in one terminal over three numbered steps", async () => {
    const doc = await render();
    expect(doc.querySelectorAll('[data-part="terminal"]')).toHaveLength(1);
    expect(terminals.at(-1)?.commands).toEqual([GATE_CLI_COMMAND, CHECK_CLI_COMMAND]);
    expect(terminals.at(-1)?.title).toBe(HOW_TITLE);
    expect(terminals.at(-1)?.highlight).toBe(GATE_REFUSAL_LINE);
    expect([...doc.querySelectorAll("ol > li h3")].map((h3) => h3.textContent)).toEqual(
      HOW_STEP_KEYS.map((key) => `landing.how.steps.${key}.title`),
    );
    expect(
      [...doc.querySelectorAll("ol > li .vk-how-step-index")].map((n) => n.textContent),
    ).toEqual(["01", "02", "03"]);
    expect(doc.body.textContent).toContain("landing.how.lead");
    expect(doc.querySelectorAll("dl, pre")).toHaveLength(0);
    expect(terminals.at(-1)?.outputs).toBe(HOW_OUTPUTS);
    expect(terminals.at(-1)?.commands).toBe(HOW_COMMANDS);
    const source = readFileSync(join(process.cwd(), "components/landing/proof.tsx"), "utf8");
    expect(source).not.toMatch(/landing\.(proof|gate)|GATE_LOCK|GATE_TARGET/);
    for (const file of ["components/landing/proof.tsx", "app/[lang]/(home)/page.tsx"]) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      expect(text, file).toContain("howStepCopy(");
      expect(text, file).not.toMatch(/"(configure|diff|verifyWrite)"/);
    }
  });

  it("holds each printed line until the step bar has finished filling", async () => {
    await render();
    expect(terminals.at(-1)?.lineDelay).toBe(HOW_LINE_DELAY_MS);
    const root = rulesFor(docsStylesheetRules(), ":root").find(
      (rule) => "--duration-demo" in rule.declarations,
    );
    const demo = Number.parseInt(root?.declarations["--duration-demo"] ?? "", 10);
    expect(demo).toBeGreaterThan(0);
    expect(HOW_LINE_DELAY_MS).toBeGreaterThan(demo);
  });
});
