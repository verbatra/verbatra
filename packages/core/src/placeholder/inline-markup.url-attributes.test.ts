import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

const LINK = '<a href="/docs">docs</a>';
const START_OF_HEADING = String.fromCharCode(1);

describe("compareInlineMarkup: a URL attribute value may not gain a script-running scheme", () => {
  it.each([
    ['<a href="javascript:alert(1)">Doku</a>', "javascript"],
    ['<a href="jav&#x09;ascript:alert(1)">Doku</a>', "javascript"],
    ['<a href="JaVaScRiPt:alert(1)">Doku</a>', "javascript"],
    [`<a href=" ${START_OF_HEADING}javascript:alert(1)">Doku</a>`, "javascript"],
    ['<a href="java\nscript:alert(1)">Doku</a>', "javascript"],
    ['<a href="javascript&colon;alert(1)">Doku</a>', "javascript"],
    ['<a href="javascript&#58;alert(1)">Doku</a>', "javascript"],
    ['<a href="javascript&#x3A alert(1)">Doku</a>', "javascript"],
    ['<a href="java&Tab;script:alert(1)">Doku</a>', "javascript"],
    ['<a href="java&NewLine;script:alert(1)">Doku</a>', "javascript"],
    ['<a href="&#106;avascript:alert(1)">Doku</a>', "javascript"],
    ['<a href="vbscript:msgbox(1)">Doku</a>', "vbscript"],
    ['<a href="data:text/html,<script>alert(1)</script>">Doku</a>', "data"],
    ["<a href=javascript:alert(1)>Doku</a>", "javascript"],
    ["<a href='javascript:alert(1)'>Doku</a>", "javascript"],
  ])("refuses %j", (translated, scheme) => {
    expect(compareInlineMarkup(LINK, translated)).toEqual({
      matches: false,
      missing: [],
      extra: [`<a href="${scheme}:...">`],
      malformed: false,
    });
  });

  it.each([
    ['<img src="/a.png">', '<img src="data:image/svg+xml,<svg onload=alert(1)>">', "img src"],
    ['<form action="/x"></form>', '<form action="javascript:alert(1)"></form>', "form action"],
    [
      '<button formaction="/x">b</button>',
      '<button formaction="javascript:alert(1)">b</button>',
      "button formaction",
    ],
    [
      '<svg><a xlink:href="#x">x</a></svg>',
      '<svg><a xlink:href="javascript:alert(1)">x</a></svg>',
      "a xlink:href",
    ],
    ['<img srcset="a.png 1x">', '<img srcset="a.png 1x, data:image/png,x 2x">', "img srcset"],
    ['<Link to="/x">x</Link>', '<Link to="javascript:alert(1)">x</Link>', "Link to"],
  ])("refuses a dangerous scheme in %j rewritten as %j", (source, translated, where) => {
    const result = compareInlineMarkup(source, translated);
    expect(result.matches).toBe(false);
    expect(result.extra.some((token) => token.startsWith(`<${where}=`))).toBe(true);
  });

  it.each([
    '<a href="/de/docs">Doku</a>',
    '<a href="/de/metadata:v2">Doku</a>',
    '<a href="docs?lang=de">Doku</a>',
    '<a href="?q=javascriptish">Doku</a>',
    '<a href="&amp;&unknown;/de">Doku</a>',
    '<a href="&#x110000;&#0;/de">Doku</a>',
  ])("accepts a localized href %j", (translated) => {
    expect(compareInlineMarkup(LINK, translated).matches).toBe(true);
  });

  it("accepts a dangerous scheme the source carries byte for byte on the same tag and attribute", () => {
    expect(
      compareInlineMarkup(
        '<a href="javascript:void(0)">Open</a>',
        '<a href="javascript:void(0)">Öffnen</a>',
      ).matches,
    ).toBe(true);
  });

  it("refuses a source's dangerous value moved to a different tag or attribute", () => {
    const result = compareInlineMarkup(
      '<a href="javascript:void(0)">Open</a> <img src="/x">',
      '<a href="/x">Öffnen</a> <img src="javascript:void(0)">',
    );
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(['<a href="./...">', '<img src="javascript:...">']);
  });

  it("refuses a dangerous value that differs from the source's in any byte", () => {
    expect(
      compareInlineMarkup(
        '<a href="javascript:void(0)">x</a>',
        '<a href="javascript:void(1)">x</a>',
      ).matches,
    ).toBe(false);
  });

  it("does not read attributes on a closing tag, which an HTML parser drops", () => {
    expect(compareInlineMarkup("<b>x</b>", '<b>x</b href="javascript:alert(1)">').matches).toBe(
      true,
    );
  });
});

describe("compareInlineMarkup: srcdoc and event handler values must be carried unchanged", () => {
  it("refuses a srcdoc value the source does not carry", () => {
    expect(
      compareInlineMarkup(
        '<iframe srcdoc="<b>hi</b>"></iframe>',
        '<iframe srcdoc="<img src=x onerror=alert(1)>"></iframe>',
      ),
    ).toEqual({
      matches: false,
      missing: [],
      extra: ['<iframe srcdoc="...">'],
      malformed: false,
    });
  });

  it("refuses an event handler whose code the candidate rewrote", () => {
    expect(
      compareInlineMarkup(
        '<a href="#" onclick="track()">x</a>',
        '<a href="#" onclick="alert(document.cookie)">x</a>',
      ).extra,
    ).toEqual(['<a onclick="...">']);
  });

  it.each(['<iframe srcdoc="<b>hi</b>"></iframe>', '<a href="#" onclick="track()">x</a>'])(
    "accepts %j translated as itself",
    (value) => {
      expect(compareInlineMarkup(value, value).matches).toBe(true);
    },
  );
});
