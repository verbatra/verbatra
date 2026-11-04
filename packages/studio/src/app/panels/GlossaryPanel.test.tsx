// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderAsync, rpcError, stubRpc } from "../test-support.js";
import { GlossaryPanel } from "./GlossaryPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const GLOSSARY = {
  ok: true,
  result: {
    indicator: { source: "none" },
    version: null,
    locales: [],
    terms: [],
    doNotTranslate: [],
    redactedTerms: [],
  },
} as const;

describe("GlossaryPanel", () => {
  it("names the page and shows the glossary once it has loaded", async () => {
    stubRpc({ "glossary.get": GLOSSARY });

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.get("h1").textContent).toBe("Glossary");
    expect(view.text()).toContain("Glossary");
    expect(view.query('[role="status"]')).toBeNull();
  });

  it("shows the structured error when the glossary cannot be read", async () => {
    stubRpc({ "glossary.get": rpcError("INTERNAL", "glossary unreadable") });

    const view = await renderAsync(<GlossaryPanel />);

    expect(view.get('[role="alert"]').textContent).toContain("unexpected server error");
  });
});
