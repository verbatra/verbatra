// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MCP_VERSION, PACKAGE_VERSION, STUDIO_VERSION } from "@/lib/site";
import en from "@/messages/en.json";

type Values = Record<string, string | ((chunks: string) => string)>;

function format(text: string, values: Values): string {
  return text
    .replace(/<(\w+)>(.*?)<\/\1>/g, (_, tag: string, chunks: string) => {
      const wrap = values[tag];
      return typeof wrap === "function" ? wrap(chunks) : chunks;
    })
    .replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
}

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const messages =
      namespace === "docs.statusBadges" ? en.docs.statusBadges : en.docs.availableFrom;
    const t = (key: string, values: Values = {}) =>
      format((messages as Record<string, string>)[key] ?? "", values);
    t.markup = t;
    return t;
  },
}));

const { AvailableFrom, AVAILABLE_FROM_CLASS } = await import("./available-from");

function line(version: string): readonly [number, number] {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return [major, minor];
}

function inLine(version: string, offset: number, patch = 0): string {
  const [major, minor] = line(version);
  return `${major}.${minor + offset}.${patch}`;
}

async function render(version: string, pkg?: string): Promise<string> {
  const node = await AvailableFrom({
    version,
    locale: "en",
    ...(pkg === undefined ? {} : { pkg }),
  });
  return renderToStaticMarkup(node);
}

async function renderedBadge(version: string, pkg?: string): Promise<HTMLElement> {
  const badge = new DOMParser().parseFromString(await render(version, pkg), "text/html").body
    .firstElementChild;
  if (!(badge instanceof HTMLElement)) throw new Error("no badge rendered");
  return badge;
}

describe("AvailableFrom for a release in the current line", () => {
  it.each([
    ["the first version of the line", inLine(PACKAGE_VERSION, 0)],
    ["a patch of the line", inLine(PACKAGE_VERSION, 0, 3)],
    ["the next unreleased minor", inLine(PACKAGE_VERSION, 1)],
  ])("renders the New pill for %s", async (_name, version) => {
    const badge = await renderedBadge(version);

    expect(badge.tagName).toBe("SPAN");
    expect(badge.classList.contains("vk-pill-new")).toBe(true);
    expect(badge.classList.contains(AVAILABLE_FROM_CLASS)).toBe(true);
    expect(badge.textContent).toBe(en.docs.statusBadges.new);
  });

  it("shows no version in the visible text and keeps the upgrade advice as the title", async () => {
    const version = inLine(PACKAGE_VERSION, 0);
    const badge = await renderedBadge(version);

    expect(badge.textContent).not.toContain(version);
    expect(badge.textContent).not.toContain("Available from");
    expect(badge.title).toContain(`verbatra ${version} or newer`);
    expect(badge.title).toContain("verbatra --version");
    expect(badge.title).not.toContain("<code>");
    expect(badge.querySelector(".sr-only")).toBeNull();
  });

  it("names the package in the title when the feature ships in its own package", async () => {
    const badge = await renderedBadge(inLine(STUDIO_VERSION, 0), "@verbatra/studio");

    expect(badge.textContent).toBe(en.docs.statusBadges.new);
    expect(badge.title).toContain(`@verbatra/studio ${inLine(STUDIO_VERSION, 0)} or newer`);
  });

  it("dates each package against its own line", async () => {
    expect(await render(inLine(MCP_VERSION, 0), "@verbatra/mcp")).toContain("vk-pill-new");
    expect(await render(inLine(MCP_VERSION, -1), "@verbatra/mcp")).toBe("");
    expect(await render(inLine(PACKAGE_VERSION, 0), "@verbatra/sdk")).toContain("vk-pill-new");
  });
});

describe("AvailableFrom for an older release", () => {
  it.each([
    ["the last version of the previous line", inLine(PACKAGE_VERSION, -1, 9)],
    ["the first version of the previous line", inLine(PACKAGE_VERSION, -1)],
    ["a much older line", "0.1.0"],
  ])("renders nothing for %s", async (_name, version) => {
    expect(await render(version)).toBe("");
    expect(await AvailableFrom({ version, locale: "en" })).toBeNull();
  });

  it("renders nothing for a package it does not know", async () => {
    expect(await render(inLine(PACKAGE_VERSION, 0), "@verbatra/unknown")).toBe("");
  });
});
