import { describe, expect, it } from "vitest";
import { servedPathOf } from "./relay-path";

describe("servedPathOf", () => {
  it.each([
    ["/", "/en"],
    ["/docs", "/en/docs"],
    ["/docs/quickstart", "/en/docs/quickstart"],
    ["/privacy", "/en/privacy"],
    ["/de", "/de"],
    ["/de/docs", "/de/docs"],
    ["/zh-CN/privacy", "/zh-CN/privacy"],
    ["/en", "/en/en"],
    ["/en/docs", "/en/en/docs"],
  ])("maps the public path %s to the served path %s", (path, served) => {
    expect(servedPathOf(path)).toBe(served);
  });

  it("does not treat a path that only starts with a locale code as that locale", () => {
    expect(servedPathOf("/deutsch")).toBe("/en/deutsch");
    expect(servedPathOf("/docs/de")).toBe("/en/docs/de");
  });
});
