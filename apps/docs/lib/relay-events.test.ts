import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";
import { parseRelayEvent } from "./relay-events";
import { MAX_RELAY_BODY_BYTES } from "./relay-path";

function body(value: unknown): string {
  return JSON.stringify(value);
}

describe("parseRelayEvent", () => {
  it.each([
    [{ e: "pageview", u: "/de/docs" }, { path: "/de/docs" }],
    [
      { e: "copy_code", p: { surface: "code-block" }, u: "/docs" },
      { path: "/docs", name: "copy_code", data: { surface: "code-block" } },
    ],
    [
      { e: "cta_click", p: { id: "hero-quickstart" }, u: "/" },
      { path: "/", name: "cta_click", data: { id: "hero-quickstart" } },
    ],
    [
      { e: "outbound_click", p: { dest: "github" }, u: "/" },
      { path: "/", name: "outbound_click", data: { dest: "github" } },
    ],
    [
      { e: "search_open", u: "/docs" },
      { path: "/docs", name: "search_open" },
    ],
    [
      { e: "mcp_install_click", u: "/docs" },
      { path: "/docs", name: "mcp_install_click" },
    ],
    [
      { e: "locale_switch", p: { to: "de" }, u: "/" },
      { path: "/", name: "locale_switch", data: { to: "de" } },
    ],
  ])("accepts %j", (input, expected) => {
    expect(parseRelayEvent(body(input))).toEqual(expected);
  });

  it("accepts every locale code as the locale_switch target", () => {
    for (const to of LOCALES) {
      expect(parseRelayEvent(body({ e: "locale_switch", p: { to }, u: "/" }))?.data).toEqual({
        to,
      });
    }
  });

  it.each([
    ["an unknown event name", { e: "theme_switch", u: "/" }],
    ["an unknown copy surface", { e: "copy_code", p: { surface: "free text" }, u: "/" }],
    ["an unknown cta id", { e: "cta_click", p: { id: "nope" }, u: "/" }],
    ["an unknown outbound destination", { e: "outbound_click", p: { dest: "evil" }, u: "/" }],
    ["an unknown locale", { e: "locale_switch", p: { to: "xx" }, u: "/" }],
    ["a missing property", { e: "copy_code", u: "/" }],
    ["an extra property", { e: "copy_code", p: { surface: "code-block", extra: "x" }, u: "/" }],
    ["a property on an event that takes none", { e: "search_open", p: { q: "x" }, u: "/" }],
    ["a property on a pageview", { e: "pageview", p: { a: "b" }, u: "/" }],
    ["an extra top-level key", { e: "pageview", u: "/", name: "evil" }],
    ["a missing path", { e: "pageview" }],
    ["a relative path", { e: "pageview", u: "docs" }],
    ["a protocol-relative path", { e: "pageview", u: "//evil.test/x" }],
    ["a query string", { e: "pageview", u: "/docs?q=secret" }],
    ["a fragment", { e: "pageview", u: "/docs#a" }],
    ["an absolute url", { e: "pageview", u: "https://evil.test/" }],
    ["an overlong path", { e: "pageview", u: `/${"a".repeat(300)}` }],
    ["a non-string path", { e: "pageview", u: 3 }],
    ["an array", [1]],
    ["null", null],
  ])("rejects %s", (_case, input) => {
    expect(parseRelayEvent(body(input))).toBeUndefined();
  });

  it.each(["", "not json", "{"])("rejects the non-JSON text %j", (text) => {
    expect(parseRelayEvent(text)).toBeUndefined();
  });

  it("caps the body at one kibibyte", () => {
    expect(MAX_RELAY_BODY_BYTES).toBe(1024);
  });
});
