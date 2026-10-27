// @vitest-environment jsdom

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useSiteTheme } from "./use-site-theme";

function Probe() {
  return <span>{String(useSiteTheme().resolvedTheme)}</span>;
}

describe("useSiteTheme", () => {
  it("reads no theme on the server, so a consumer needs no hydration check of its own", () => {
    document.documentElement.className = "light";
    expect(renderToString(<Probe />)).toBe("<span>undefined</span>");
  });
});
