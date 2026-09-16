import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: a URL attribute keeps its source's scheme and authority", () => {
  it.each([
    ['<a href="/docs">Docs</a>', '<a href="/de/docs">Doku</a>'],
    ['<a href="/docs">Docs</a>', '<a href=" /de/docs ">Doku</a>'],
    ['<a href="/docs">Docs</a>', '<a href="&bsol;de&bsol;docs">Doku</a>'],
    ['<a href="https://verbatra.dev/en">Docs</a>', '<a href="https://verbatra.dev/de">Doku</a>'],
    [
      '<a href="HTTPS://Verbatra.dev/en">Docs</a>',
      '<a href="https://verbatra.dev/de?x=1#y">Doku</a>',
    ],
    ['<a href="//cdn.verbatra.dev/en">Docs</a>', '<a href="//cdn.verbatra.dev/de">Doku</a>'],
    [
      '<a href="mailto:hi@verbatra.dev">Mail</a>',
      '<a href="mailto:hi@verbatra.dev?subject=Hallo">Mail</a>',
    ],
    ['<img srcset="/a.png 1x, /b.png 2x">', '<img srcset="/de/a.png 1x, /de/b.png 2x">'],
    ['<a href="docs">Docs</a>', '<a href="?lang=de#top">Doku</a>'],
  ])("accepts %j localized as %j", (source, translated) => {
    expect(compareInlineMarkup(source, translated).matches).toBe(true);
  });

  it.each([
    [
      '<a href="/docs">Docs</a>',
      '<a href="https://evil.example/docs">Doku</a>',
      "https://evil.example",
    ],
    [
      '<a href="https://verbatra.dev/">Home</a>',
      '<a href="https://evil.example/">Start</a>',
      "https://evil.example",
    ],
    ['<base href="/">', '<base href="https://evil.example/">', "https://evil.example"],
    [
      '<script src="/a.js"></script>',
      '<script src="https://evil.example/a.js"></script>',
      "https://evil.example",
    ],
    [
      '<link rel=stylesheet href="/s.css">',
      '<link rel=stylesheet href="https://evil.example/s.css">',
      "https://evil.example",
    ],
    ['<a href="/docs">Docs</a>', '<a href="//evil.example/docs">Doku</a>', "//evil.example"],
    ['<a href="/docs">Docs</a>', '<a href="/\\evil.example/docs">Doku</a>', "/\\evil.example/docs"],
    [
      '<a href="/docs">Docs</a>',
      '<a href="&sol;&sol;evil.example/docs">Doku</a>',
      "//evil.example",
    ],
    [
      '<a href="/docs">Docs</a>',
      '<a href=" https&colon;//evil.example">Doku</a>',
      "https://evil.example",
    ],
    [
      '<a href="/docs">Docs</a>',
      '<a href="https:evil.example/docs">Doku</a>',
      "https://evil.example",
    ],
    [
      '<a href="https://verbatra.dev/">Home</a>',
      '<a href="https://verbatra.dev@evil.example/">Start</a>',
      "https://verbatra.dev@evil.example",
    ],
    [
      '<a href="https://verbatra.dev/">Home</a>',
      '<a href="http://verbatra.dev/">Start</a>',
      "http://verbatra.dev",
    ],
    [
      '<a href="https://verbatra.dev/">Home</a>',
      '<a href="https://verbatra.dev:444/">Start</a>',
      "https://verbatra.dev:444",
    ],
    ['<a href="https://verbatra.dev/">Home</a>', '<a href="/start">Start</a>', "./"],
    [
      '<img srcset="/a.png 1x, /b.png 2x">',
      '<img srcset="/a.png 1x, https://evil.example/b.png 2x">',
      "https://evil.example",
    ],
    ['<a ping="/p">x</a>', '<a ping="/p https://evil.example/p">x</a>', "https://evil.example"],
    [
      '<object archive="/a.jar"></object>',
      '<object archive="/a.jar,https://evil.example/b.jar"></object>',
      "https://evil.example",
    ],
  ])("refuses %j rewritten as %j", (source, translated, origin) => {
    const result = compareInlineMarkup(source, translated);
    expect(result.matches).toBe(false);
    expect(result.extra.some((token) => token.includes(`="${origin}`))).toBe(true);
  });

  it.each([
    ['<a href="//verbatra.dev/en">Docs</a>', '<a href="//verbatra.dev\\@evil.example/">Doku</a>'],
    ['<a href="//verbatra.dev/en">Docs</a>', '<a href="//verbatra.dev%5C@evil.example/">Doku</a>'],
    [
      '<a href="//verbatra.dev/en">Docs</a>',
      '<a href="//verbatra.dev&bsol;@evil.example/">Doku</a>',
    ],
    ['<a href="/docs">Docs</a>', '<a href="\\\\evil.example/docs">Doku</a>'],
    [
      '<a href="app://verbatra.dev/en">Docs</a>',
      '<a href="app://verbatra.dev\\@evil.example/">Doku</a>',
    ],
  ])(
    "refuses %j rewritten as %j, whose backslash a page without a web scheme reads differently",
    (source, translated) => {
      const result = compareInlineMarkup(source, translated);
      expect(result.matches).toBe(false);
      expect(result.extra.some((token) => /\\|%5c/i.test(token))).toBe(true);
    },
  );

  it.each([
    [
      '<a href="https://verbatra.dev/">Home</a>',
      '<a href="https://verbatra.dev\\@evil.example/">Start</a>',
    ],
    ['<a href="//verbatra.dev/en">Docs</a>', '<a href="//verbatra.dev/de">Doku</a>'],
    ['<a href="docs">Docs</a>', '<a href="docs\\de">Doku</a>'],
  ])(
    "accepts %j rewritten as %j, where a web scheme, no backslash or a started path fixes the host",
    (source, translated) => {
      expect(compareInlineMarkup(source, translated).matches).toBe(true);
    },
  );

  it("allows a value whose origin any source value of the same tag and attribute carries", () => {
    expect(
      compareInlineMarkup(
        '<a href="https://verbatra.dev/a">A</a> <a href="/b">B</a>',
        '<a href="/de/b">B</a> <a href="https://verbatra.dev/de/a">A</a>',
      ).matches,
    ).toBe(true);
  });

  it("does not let an origin carried by a different attribute stand in", () => {
    expect(
      compareInlineMarkup(
        '<a href="/a" ping="https://evil.example/p">A</a>',
        '<a href="https://evil.example/a" ping="https://evil.example/p">A</a>',
      ).matches,
    ).toBe(false);
  });
});
