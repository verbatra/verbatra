// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import { contrast, themeTokens } from "@/test-support/contrast";
import { buttonClasses } from "./button";
import { CopyControl } from "./copy-control";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SURFACES = ["--surface-bg", "--surface-band", "--surface-card", "--v-void"] as const;

const THEMES = ["dark", "light"] as const;

function borderToken(className: string): string {
  const token = /(?:^|\s)border-\((--[\w-]+)\)/.exec(className)?.[1];
  if (token === undefined) throw new Error(`no border token in "${className}"`);
  return token;
}

function expectBoundary(token: string): void {
  for (const theme of THEMES) {
    const tokens = themeTokens()[theme];
    for (const surface of SURFACES) {
      expect(
        contrast(tokens, token, surface),
        `${token} on ${surface} (${theme})`,
      ).toBeGreaterThanOrEqual(3);
    }
  }
}

async function copyControlClasses(clipboard: () => Promise<void>): Promise<string[]> {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(clipboard) },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <CopyControl
        text="x"
        label="Copy"
        status={{ copy: "Copy", copied: "Copied", copyFailed: "Failed" }}
      />,
    );
  });
  const button = host.querySelector("button");
  if (button === null) throw new Error("no copy button");
  const idle = button.className;
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  const settled = button.className;
  act(() => root.unmount());
  host.remove();
  return [idle, settled];
}

describe("control boundaries", () => {
  it.each(["secondary", "outline"] as const)(
    "draws the %s button's border at 3:1 or more on every landing surface",
    (variant) => {
      expectBoundary(borderToken(buttonClasses(variant)));
    },
  );

  it("draws the copy button's border at 3:1 or more when idle, copied and failed", async () => {
    const copied = await copyControlClasses(async () => undefined);
    const failed = await copyControlClasses(async () => {
      throw new Error("denied");
    });
    const states = [copied[0], copied[1], failed[1]].map((className) => className ?? "");
    expect(new Set(states.map(borderToken)).size).toBe(3);
    for (const className of states) expectBoundary(borderToken(className));
  });

  it.each([
    [".vk-page-actions button", "border"],
    [".vk-header-search", "border-color"],
  ] as const)(
    "draws the border of %s at 3:1 or more on every landing surface",
    (selector, property) => {
      const value = docsStylesheetRules()
        .filter((rule) => rule.selector === selector)
        .map((rule) => rule.declarations[property])
        .find((declared) => declared !== undefined);
      const token = /var\((--[\w-]+)\)/.exec(value ?? "")?.[1];
      if (token === undefined) throw new Error(`no border token on ${selector}`);
      expect(token).not.toBe("--border-default");
      expectBoundary(token);
    },
  );
});
