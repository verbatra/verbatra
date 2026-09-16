import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: attributes that change what a page does keep their source value", () => {
  it.each([
    [
      "N22 meta refresh to javascript",
      '<meta http-equiv="refresh" content="5;url=/home">',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      '<meta content="...">',
    ],
    [
      "meta refresh to a remote page",
      '<meta http-equiv="refresh" content="5;url=/home">',
      '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
      '<meta content="...">',
    ],
    [
      "meta http-equiv",
      '<meta http-equiv="content-language" content="en">',
      '<meta http-equiv="refresh" content="en">',
      '<meta http-equiv="...">',
    ],
    [
      "N25 link rel=import",
      '<link rel="stylesheet" href="/a.css">',
      '<link rel="import" href="/a.css">',
      '<link rel="...">',
    ],
    ["link as", '<link as="style" href="/a">', '<link as="script" href="/a">', '<link as="...">'],
    [
      "link integrity",
      '<link integrity="sha384-a" href="/a">',
      '<link integrity="sha384-b" href="/a">',
      '<link integrity="...">',
    ],
    [
      "link crossorigin",
      '<link crossorigin="anonymous" href="/a">',
      '<link crossorigin="use-credentials" href="/a">',
      '<link crossorigin="...">',
    ],
    [
      "link type",
      '<link type="text/css" href="/a">',
      '<link type="text/html" href="/a">',
      '<link type="...">',
    ],
    [
      "N36 script type to module",
      '<script type="text/template">{{x}}</script>',
      '<script type="module">{{x}}</script>',
      '<script type="...">',
    ],
    [
      "script nomodule",
      "<script nomodule></script>",
      '<script nomodule="x"></script>',
      '<script nomodule="...">',
    ],
    [
      "script integrity",
      '<script integrity="sha384-a" src="/a.js"></script>',
      '<script integrity="sha384-b" src="/a.js"></script>',
      '<script integrity="...">',
    ],
    [
      "script crossorigin",
      '<script crossorigin="anonymous" src="/a.js"></script>',
      '<script crossorigin="use-credentials" src="/a.js"></script>',
      '<script crossorigin="...">',
    ],
    ["base target", '<base target="_self">', '<base target="_top">', '<base target="...">'],
    [
      "N38 style url(javascript)",
      '<span style="color:red">x</span>',
      '<span style="background:url(javascript:alert(1))">x</span>',
      '<span style="...">',
    ],
    [
      "N39 set attributeName=onclick",
      '<svg><set attributeName="fill" to="red"/></svg>',
      '<svg><set attributeName="onclick" to="red"/></svg>',
      '<set attributeName="...">',
    ],
    [
      "animate attributeType",
      '<svg><animate attributeType="CSS" attributeName="fill"/></svg>',
      '<svg><animate attributeType="XML" attributeName="fill"/></svg>',
      '<animate attributeType="...">',
    ],
    [
      "animateTransform attributeName",
      '<svg><animateTransform attributeName="transform"/></svg>',
      '<svg><animateTransform attributeName="href"/></svg>',
      '<animateTransform attributeName="...">',
    ],
    [
      "animateMotion attributeName",
      '<svg><animateMotion attributeName="x"/></svg>',
      '<svg><animateMotion attributeName="href"/></svg>',
      '<animateMotion attributeName="...">',
    ],
    [
      "iframe sandbox",
      '<iframe sandbox="allow-forms"></iframe>',
      '<iframe sandbox="allow-scripts allow-same-origin"></iframe>',
      '<iframe sandbox="...">',
    ],
    [
      "iframe allow",
      '<iframe allow="fullscreen"></iframe>',
      '<iframe allow="camera"></iframe>',
      '<iframe allow="...">',
    ],
    [
      "iframe allowfullscreen",
      "<iframe allowfullscreen></iframe>",
      '<iframe allowfullscreen="x"></iframe>',
      '<iframe allowfullscreen="...">',
    ],
    [
      "form method",
      '<form method="get"></form>',
      '<form method="post"></form>',
      '<form method="...">',
    ],
    [
      "form enctype",
      '<form enctype="text/plain"></form>',
      '<form enctype="multipart/form-data"></form>',
      '<form enctype="...">',
    ],
    [
      "form target",
      '<form target="_self"></form>',
      '<form target="_blank"></form>',
      '<form target="...">',
    ],
  ])("refuses a changed %s", (_label, source, translated, detail) => {
    const result = compareInlineMarkup(source, translated);
    expect(result.matches).toBe(false);
    expect(result.extra).toContain(detail);
  });

  it.each([
    '<meta http-equiv="refresh" content="5;url=/home">',
    '<link rel="stylesheet" href="/a.css">',
    '<script type="text/template">{{x}}</script>',
    '<span style="color:red">x</span>',
    '<svg><set attributeName="fill" to="red"/></svg>',
    '<iframe sandbox="allow-forms" allow="fullscreen" allowfullscreen></iframe>',
    '<form method="get" enctype="text/plain" target="_self"></form>',
  ])("accepts %j translated as itself", (value) => {
    expect(compareInlineMarkup(value, value).matches).toBe(true);
  });

  it("compares the values after decoding character references", () => {
    expect(
      compareInlineMarkup(
        '<meta http-equiv="refresh" content="5;url=/home">',
        '<meta http-equiv="refresh" content="5&#59;url=/home">',
      ).matches,
    ).toBe(true);
  });

  it("still lets the text and a title attribute beside such attributes be translated", () => {
    expect(
      compareInlineMarkup(
        '<span style="color:red" title="Red">Red</span>',
        '<span style="color:red" title="Rot">Rot</span>',
      ).matches,
    ).toBe(true);
  });

  it("does not hold the same attribute name on an unrelated element", () => {
    expect(
      compareInlineMarkup('<input type="text" value="a">', '<input type="text" value="b">').matches,
    ).toBe(true);
    expect(compareInlineMarkup('<a target="_self">x</a>', '<a target="_blank">x</a>').matches).toBe(
      true,
    );
  });
});
