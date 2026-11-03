import { describe, expect, it } from "vitest";
import { docsGlobalCss, stylesheetRules, uiTokensCss } from "@/lib/stylesheet-rules";

const KNOWN_EXTERNAL_VARS: ReadonlyArray<string> = [
  "--callout-color",
  "--faq-head-size",
  "--font-geist-mono",
  "--font-geist-sans",
  "--marquee-items",
];

describe("the shared token package wiring", () => {
  it("imports the ui tokens after the Fumadocs preset", () => {
    const css = docsGlobalCss();
    const preset = css.indexOf('@import "fumadocs-ui/css/preset.css";');
    const ui = css.indexOf('@import "@verbatra/ui/tokens.css";');
    expect(preset).toBeGreaterThan(-1);
    expect(ui).toBeGreaterThan(preset);
  });

  it("never redeclares in the docs :root a token the ui themes declare", () => {
    const themed = new Set(
      stylesheetRules(uiTokensCss())
        .filter((rule) => rule.selector.startsWith(".dark") || rule.selector.startsWith(".light"))
        .flatMap((rule) => Object.keys(rule.declarations)),
    );
    const redeclared = stylesheetRules(docsGlobalCss())
      .filter((rule) => rule.selector === ":root")
      .flatMap((rule) => Object.keys(rule.declarations))
      .filter((name) => themed.has(name));
    expect(redeclared).toEqual([]);
  });

  it("resolves every var() in the docs stylesheets to a declared custom property", () => {
    const css = `${uiTokensCss()}\n${docsGlobalCss()}`;
    const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
    const unresolved = new Set(
      [...css.matchAll(/var\((--[\w-]+)/g)]
        .map((match) => match[1] ?? "")
        .filter((name) => !declared.has(name)),
    );
    expect([...unresolved].sort()).toEqual([...KNOWN_EXTERNAL_VARS].sort());
  });
});
