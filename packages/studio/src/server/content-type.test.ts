import { describe, expect, it } from "vitest";
import { contentTypeFor } from "./content-type.js";

describe("contentTypeFor", () => {
  it.each([
    ["/index.html", "text/html; charset=utf-8"],
    ["/assets/app.js", "text/javascript; charset=utf-8"],
    ["/assets/app.mjs", "text/javascript; charset=utf-8"],
    ["/assets/app.css", "text/css; charset=utf-8"],
    ["/manifest.json", "application/json; charset=utf-8"],
    ["/logo.svg", "image/svg+xml"],
    ["/logo.png", "image/png"],
    ["/favicon.ico", "image/x-icon"],
    ["/assets/geist-latin-wght-normal-AbC123.woff2", "font/woff2"],
    ["/licenses/OFL-Geist.txt", "text/plain; charset=utf-8"],
  ])("maps %s to %s", (assetPath, expected) => {
    expect(contentTypeFor(assetPath)).toBe(expected);
  });

  it("falls back to a generic binary type for an unknown extension", () => {
    expect(contentTypeFor("/data.bin")).toBe("application/octet-stream");
  });

  it("falls back to a generic binary type for a path with no extension", () => {
    expect(contentTypeFor("/no-extension")).toBe("application/octet-stream");
  });
});
