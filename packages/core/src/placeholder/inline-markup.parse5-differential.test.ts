import {
  type DefaultTreeAdapterMap,
  parse,
  parseFragment,
  defaultTreeAdapter as tree,
} from "parse5";
import { describe, expect, it } from "vitest";
import { compareInlineMarkup, type InlineMarkupOptions } from "./inline-markup.js";
import { URL_ATTRIBUTES } from "./url-attributes.js";

type ParserNode = DefaultTreeAdapterMap["node"];
type ParserElement = DefaultTreeAdapterMap["element"];

interface ParsedShape {
  readonly elements: ReadonlySet<string>;
  readonly attributes: ReadonlySet<string>;
  readonly comments: number;
  readonly values: ReadonlySet<string>;
  readonly guardedValues: readonly string[];
  readonly origins: ReadonlySet<string>;
  readonly urlOrigins: readonly string[];
  readonly verbatim: ReadonlyMap<string, readonly string[]>;
}

interface UrlConstructor {
  new (url: string, base: string): { readonly protocol: string; readonly host: string };
}

interface GeneratedPair {
  readonly source: string;
  readonly candidate: string;
  readonly options: InlineMarkupOptions;
}

const SEED = 270;
const PAIR_COUNT = 3000;
const PROSE_WORD_ELEMENTS: ReadonlySet<string> = new Set(["enter", "tab"]);
const WHATWG_URL = (globalThis as unknown as { readonly URL: UrlConstructor }).URL;
const RESOLUTION_BASES = ["https://relative.invalid/base/", "app://relative.invalid/base/"];
const URL_LIST_SEPARATORS: Readonly<Record<string, RegExp>> = {
  archive: /[\s,]+/,
  ping: /\s+/,
  srcset: /,/,
  values: /;/,
};
const SCRIPTING_MODES = [true, false];
const GUARDED_ATTRIBUTES: ReadonlySet<string> = new Set([
  "animate attributename",
  "animate attributetype",
  "animatemotion attributename",
  "animatemotion attributetype",
  "animatetransform attributename",
  "animatetransform attributetype",
  "base target",
  "form enctype",
  "form method",
  "form target",
  "iframe allow",
  "iframe allowfullscreen",
  "iframe sandbox",
  "link as",
  "link crossorigin",
  "link integrity",
  "link rel",
  "link type",
  "meta content",
  "meta http-equiv",
  "script crossorigin",
  "script integrity",
  "script nomodule",
  "script type",
  "set attributename",
  "set attributetype",
]);

function isGuarded(element: string, name: string): boolean {
  return (
    GUARDED_ATTRIBUTES.has(`${element} ${name}`) ||
    ["srcdoc", "style"].includes(name) ||
    name.startsWith("on")
  );
}
const VERBATIM_ELEMENTS: ReadonlySet<string> = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "style",
  "xmp",
]);
const DANGEROUS_SCHEME = /(?:^|[\s,])(?:javascript|vbscript|data):/;
const XLIFF_TAGS = ['<g id="1">', "<x id/>"];
const XLIFF_PLACEHOLDER = /<g id="1">|<\/g>|<x id="2"\/>/g;

const TEXT = ["Hello", " world", " ", "a<b and c>d", "5 < 10", "x > y", "&lt;b&gt;", "'", '"', "="];
const PHRASING = [
  "<b>",
  "</b>",
  "<i>",
  "</i>",
  "<span>",
  "</span>",
  "<br>",
  "<br/>",
  "</br>",
  "<p>",
];
const RAW_TEXT = [
  "<script>",
  "</script>",
  "<title>",
  "</TITLE >",
  "<textarea/>",
  "</textarea>",
  "<style>",
  "</style>",
  "<xmp>",
  "</xmp>",
  "<iframe>",
  "</iframe>",
  "<noscript>",
  "</noscript>",
  "<noembed>",
  "</noembed>",
  "<plaintext>",
  '<b x="</script>',
  "<i y='</title>",
  '<u v="</textarea>',
  '<q r="</style>',
  "<a b='</noscript>",
  "<!--<script>",
  "-->",
];
const INJECTIONS = [
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "<script>alert(1)</script>",
  '">',
  "'>",
  "<input onfocus=alert(1) autofocus>",
];
const CONSTRUCTS = [
  "<!-- note -->",
  "<!-->",
  "<!--->",
  "<!--",
  "--!>",
  "<![CDATA[x]]>",
  "<![CDATA[",
  "]]>",
  "<?php ?>",
  "<!x>",
  "</1 x>",
  "</0>",
  "<0>",
  "</>",
  "</ x>",
  "</@>",
];
const URLS = [
  '<a href="/docs">',
  "</a>",
  '<a href="javascript:alert(1)">',
  '<a href="jav&#x09;ascript:alert(1)">',
  "<a href=&#106;avascript:alert(1)>",
  '<a href="java&Tab;script:alert(1)">',
  '<a href="javascript&colon;alert(1)">',
  '<img src="data:image/svg+xml,x">',
  '<img src="/a.png">',
  '<iframe srcdoc="<b>x</b>">',
  '<iframe srcdoc="<img src=x onerror=alert(1)>">',
  '<form action="/x">',
  "</form>",
];
const ELEMENT_WORDS = [
  "<Enter>",
  "<Tab>",
  "<Del>",
  "<image>",
  "<my-widget>",
  "</my-widget>",
  "<x-key onclick=alert(1)>",
  "<svg>",
  "</svg>",
  "<math>",
];
const ORIGINS = [
  '<a href="https://verbatra.dev/en">',
  '<a href="https://verbatra.dev/de">',
  '<a href="https://evil.example/">',
  '<a href="//evil.example/x">',
  '<a href="/\\evil.example/x">',
  '<a href="&sol;&sol;evil.example/">',
  '<a href="/de/docs">',
  '<base href="/">',
  '<base href="https://evil.example/">',
  '<script src="/a.js">',
  '<script src="https://evil.example/a.js">',
  '<link rel="stylesheet" href="/s.css">',
  '<link rel="stylesheet" href="https://evil.example/s.css">',
  '<img srcset="/a.png 1x, /b.png 2x">',
  '<img srcset="/a.png 1x, https://evil.example/b.png 2x">',
  '<a ping="/p https://evil.example/p">',
  '<a href="//verbatra.dev/en">',
  '<a href="//verbatra.dev/de">',
  '<a href="//verbatra.dev\\@evil.example/">',
  '<a href="//verbatra.dev%5C@evil.example/">',
  '<a href="https://verbatra.dev\\@evil.example/">',
];
const GUARDED = [
  '<meta http-equiv="refresh" content="5;url=/home">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<meta http-equiv="refresh" content="5&#59;url=/home">',
  '<link rel="import" href="/s.css">',
  '<link rel="stylesheet" href="/s.css">',
  '<script type="text/template">',
  '<script type="module">',
  '<span style="color:red">',
  '<span style="background:url(javascript:alert(1))">',
  "</span>",
  '<svg><set attributeName="fill" to="red"/>',
  '<svg><set attributeName="onclick" to="red"/>',
  '<iframe sandbox="allow-forms">',
  '<iframe sandbox="allow-scripts allow-same-origin">',
  '<b onclick="go()">',
  '<b onclick="alert(1)">',
];
const XLIFF = ['<g id="1">', "</g>", '<x id="2"/>'];
const POOLS = [
  TEXT,
  TEXT,
  PHRASING,
  RAW_TEXT,
  INJECTIONS,
  CONSTRUCTS,
  URLS,
  ORIGINS,
  GUARDED,
  GUARDED,
  ELEMENT_WORDS,
  XLIFF,
];

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error("picked from an empty pool");
  }
  return item;
}

function piece(random: () => number): string {
  return pick(random, pick(random, POOLS));
}

function pieces(random: () => number, count: number): string[] {
  return Array.from({ length: count }, () => piece(random));
}

function sourcePieces(random: () => number): string[] {
  const parts = pieces(random, 1 + Math.floor(random() * 6));
  if (random() < 0.04) {
    parts.unshift("<br>".repeat(257 + Math.floor(random() * 4)));
  }
  return parts;
}

function sibling(random: () => number, part: string | undefined): string {
  const pool = POOLS.find((candidates) => part !== undefined && candidates.includes(part));
  return pool === undefined ? "Hallo" : pick(random, pool);
}

function mutate(random: () => number, parts: readonly string[]): string[] {
  const mutated = [...parts];
  const steps = 1 + Math.floor(random() * 3);
  for (let step = 0; step < steps; step += 1) {
    const at = Math.floor(random() * (mutated.length + 1));
    const operation = random();
    if (operation < 0.35) {
      mutated.splice(at, 0, piece(random));
    } else if (operation < 0.5) {
      mutated.splice(at, 1, sibling(random, mutated[at]));
    } else if (operation < 0.6) {
      mutated.splice(at, 1);
    } else if (operation < 0.8) {
      const [moved] = mutated.splice(Math.floor(random() * mutated.length), 1);
      mutated.splice(at, 0, moved ?? "");
    } else {
      mutated.splice(at, 0, mutated[Math.floor(random() * mutated.length)] ?? "Hallo");
    }
  }
  return mutated;
}

function generatePairs(): readonly GeneratedPair[] {
  const random = mulberry32(SEED);
  const pairs: GeneratedPair[] = [];
  while (pairs.length < PAIR_COUNT) {
    const parts = sourcePieces(random);
    const candidate =
      random() < 0.15 ? pieces(random, 1 + Math.floor(random() * 5)) : mutate(random, parts);
    const options = random() < 0.2 ? { ignoreTags: XLIFF_TAGS } : {};
    pairs.push({ source: parts.join(""), candidate: candidate.join(""), options });
  }
  return pairs;
}

function divContext(): DefaultTreeAdapterMap["parentNode"] {
  const document = parse("<div></div>");
  const [html] = tree.getChildNodes(document);
  const body = html === undefined ? undefined : tree.getChildNodes(html as ParserElement)[1];
  const div = body === undefined ? undefined : tree.getChildNodes(body as ParserElement)[0];
  if (div === undefined || !tree.isElementNode(div)) {
    throw new Error("parse5 did not build a div context");
  }
  return div;
}

const DIV = divContext();

function attributeName(attribute: { name: string; prefix?: string }): string {
  return (
    attribute.prefix === undefined ? attribute.name : `${attribute.prefix}:${attribute.name}`
  ).toLowerCase();
}

function readableUrl(value: string): string {
  return value.replace(/[\t\n\r]/g, "").toLowerCase();
}

function urlsIn(name: string, value: string): readonly string[] {
  const separator = URL_LIST_SEPARATORS[name];
  if (separator === undefined) {
    return [value];
  }
  const parts = value.split(separator).map((part) => part.trim());
  const urls = name === "srcset" ? parts.map((part) => part.split(/\s+/, 1).join("")) : parts;
  return urls.filter((url) => url.length > 0);
}

function resolvedOrigin(url: string, base: string): string {
  try {
    const resolved = new WHATWG_URL(url, base);
    return `${base} ${resolved.protocol}//${resolved.host}`;
  } catch {
    return `unparsable ${url}`;
  }
}

function childrenOf(node: ParserNode): readonly ParserNode[] {
  if (!("childNodes" in node)) {
    return [];
  }
  const children: ParserNode[] = [...node.childNodes];
  if ("content" in node) {
    children.push(node.content);
  }
  return children;
}

function textOf(node: ParserNode): string {
  if (tree.isTextNode(node)) {
    return node.value;
  }
  return childrenOf(node).map(textOf).join("");
}

function verbatimContents(node: ParserNode, contents: Map<string, string[]>): void {
  for (const child of childrenOf(node)) {
    const name = tree.isElementNode(child) ? child.tagName.toLowerCase() : "";
    if (VERBATIM_ELEMENTS.has(name)) {
      contents.set(name, [...(contents.get(name) ?? []), textOf(child)]);
    }
    verbatimContents(child, contents);
  }
}

interface MutableShape {
  readonly elements: Set<string>;
  readonly attributes: Set<string>;
  readonly values: Set<string>;
  readonly guardedValues: string[];
  readonly origins: Set<string>;
  readonly urlOrigins: string[];
  readonly verbatim: Map<string, string[]>;
  comments: number;
}

function recordAttribute(shape: MutableShape, element: string, name: string, raw: string): void {
  const key = `${element} ${name}`;
  const value = `${key}=${raw}`;
  shape.attributes.add(key);
  shape.values.add(value);
  const dangerous = URL_ATTRIBUTES.has(name) && DANGEROUS_SCHEME.test(readableUrl(raw));
  if (dangerous || isGuarded(element, name)) {
    shape.guardedValues.push(value);
  }
  for (const url of URL_ATTRIBUTES.has(name) ? urlsIn(name, raw) : []) {
    for (const base of RESOLUTION_BASES) {
      const origin = `${key} ${resolvedOrigin(url, base)}`;
      shape.origins.add(origin);
      shape.urlOrigins.push(origin);
    }
  }
}

function recordNode(shape: MutableShape, node: ParserNode): void {
  if (tree.isCommentNode(node)) {
    shape.comments += 1;
  }
  if (!tree.isElementNode(node)) {
    return;
  }
  const element = node.tagName.toLowerCase();
  shape.elements.add(element);
  for (const attribute of node.attrs) {
    recordAttribute(shape, element, attributeName(attribute), attribute.value);
  }
}

function shapeOf(html: string, scriptingEnabled: boolean): ParsedShape {
  const shape: MutableShape = {
    elements: new Set(),
    attributes: new Set(),
    values: new Set(),
    guardedValues: [],
    origins: new Set(),
    urlOrigins: [],
    verbatim: new Map(),
    comments: 0,
  };
  const fragment = parseFragment(DIV, html, { scriptingEnabled });
  verbatimContents(fragment, shape.verbatim);
  const pending: ParserNode[] = [fragment];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    pending.push(...childrenOf(node));
    recordNode(shape, node);
  }
  return shape;
}

function absentFrom(
  known: ReadonlySet<string>,
  items: Iterable<string>,
  label: string,
): readonly string[] {
  return [...items].filter((item) => !known.has(item)).map((item) => `${label} ${item}`);
}

function changedContents(source: ParsedShape, candidate: ParsedShape): readonly string[] {
  const changed: string[] = [];
  for (const [name, contents] of candidate.verbatim) {
    const expected = source.verbatim.get(name) ?? [];
    contents.forEach((content, index) => {
      if (expected[index] !== content) {
        changed.push(`${name} content ${JSON.stringify(content)}`);
      }
    });
  }
  return changed;
}

function introducedBy(source: ParsedShape, candidate: ParsedShape): readonly string[] {
  const elements = [...candidate.elements].filter((element) => !PROSE_WORD_ELEMENTS.has(element));
  const comments =
    candidate.comments > source.comments
      ? [`${candidate.comments - source.comments} comment(s)`]
      : [];
  return [
    ...absentFrom(source.elements, elements, "element"),
    ...absentFrom(source.attributes, candidate.attributes, "attribute"),
    ...comments,
    ...absentFrom(source.values, candidate.guardedValues, "value"),
    ...absentFrom(source.origins, candidate.urlOrigins, "url origin"),
    ...changedContents(source, candidate),
  ];
}

function placeholdersOf(value: string): string {
  return [...value.matchAll(XLIFF_PLACEHOLDER)]
    .map((match) => match[0])
    .sort()
    .join("");
}

function passesPlaceholderCheck(pair: GeneratedPair): boolean {
  return (
    pair.options.ignoreTags === undefined ||
    placeholdersOf(pair.source) === placeholdersOf(pair.candidate)
  );
}

describe("compareInlineMarkup against the parse5 HTML parser", () => {
  const pairs = generatePairs();

  it("accepts every generated value translated as itself", () => {
    const refusedIdentity = pairs
      .flatMap((pair) => [pair.source, pair.candidate])
      .filter((value) => !compareInlineMarkup(value, value).matches);
    expect(refusedIdentity).toEqual([]);
  });

  it("introduces nothing parse5 does not find in the source, with scripting on or off", () => {
    const misses = pairs
      .filter((pair) => passesPlaceholderCheck(pair))
      .filter((pair) => compareInlineMarkup(pair.source, pair.candidate, pair.options).matches)
      .map((pair) => ({
        ...pair,
        introduced: SCRIPTING_MODES.flatMap((scripting) =>
          introducedBy(shapeOf(pair.source, scripting), shapeOf(pair.candidate, scripting)),
        ),
      }))
      .filter((pair) => pair.introduced.length > 0);
    expect(misses).toEqual([]);
  });

  it("exercises both verdicts, so neither assertion passes vacuously", () => {
    const accepted = pairs.filter(
      (pair) => compareInlineMarkup(pair.source, pair.candidate, pair.options).matches,
    );
    expect(accepted.length).toBeGreaterThan(PAIR_COUNT / 20);
    expect(accepted.length).toBeLessThan(PAIR_COUNT);
  });
});
