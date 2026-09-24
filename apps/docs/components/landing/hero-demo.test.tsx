// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TerminalProps } from "./terminal";

const terminalProps: TerminalProps[] = [];

vi.mock("./terminal", () => ({
  Terminal: (props: TerminalProps) => {
    terminalProps.push(props);
    return null;
  },
}));

const { HeroDemo } = await import("./hero-demo");

const LABELS = {
  tablist: "Demo",
  cli: "Terminal",
  studio: "Studio",
  studioAlt: "Studio",
  session: "Session",
  captionCli: "CLI caption",
  captionStudio: "Studio caption",
};

describe("HeroDemo: replay", () => {
  it("starts replaying while only the top of the window peeks above the fold", () => {
    renderToStaticMarkup(<HeroDemo labels={LABELS} />);
    const props = terminalProps.at(-1);
    expect(props?.playThreshold).toBeDefined();
    expect(props?.playThreshold).toBeLessThanOrEqual(0.2);
    expect(props?.fitContent).toBe(true);
  });
});
