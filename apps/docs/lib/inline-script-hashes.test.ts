import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectScriptHashes,
  htmlRoute,
  inlineScriptHashes,
  manifestProblems,
  scriptHash,
} from "./inline-script-hashes.mjs";
import { NOT_FOUND_ROUTE } from "./script-hashes-manifest.mjs";

const BOOTSTRAP = "(self.__next_f=self.__next_f||[]).push([0])";
const FLIGHT = 'self.__next_f.push([1,"0:{\\"P\\":null}\\n"])';

function sha256(source: string): string {
  return `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
}

describe("scriptHash", () => {
  it("is the CSP sha256 source expression of the exact script text", () => {
    expect(scriptHash(BOOTSTRAP)).toBe(sha256(BOOTSTRAP));
    expect(scriptHash("")).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
  });
});

describe("inlineScriptHashes", () => {
  it("hashes every inline executable script once, sorted", () => {
    const html = `<html><body><script>${FLIGHT}</script><script>${BOOTSTRAP}</script><script>${BOOTSTRAP}</script></body></html>`;
    expect(inlineScriptHashes(html)).toEqual([sha256(BOOTSTRAP), sha256(FLIGHT)].sort());
  });

  it("hashes scripts typed as JavaScript or module", () => {
    const html = [
      `<script type="text/javascript">a()</script>`,
      `<script type='module'>b()</script>`,
      `<SCRIPT TYPE=application/javascript>c()</SCRIPT>`,
      `<script type="">d()</script>`,
    ].join("");
    expect(inlineScriptHashes(html)).toEqual(
      ["a()", "b()", "c()", "d()"].map((source) => sha256(source)).sort(),
    );
  });

  it("skips external scripts and data blocks, which script-src hashes do not govern", () => {
    const html = [
      `<script src="/_next/static/chunks/main.js" async=""></script>`,
      `<script async src="https://umami.kreitz-webdev.de/script.js"></script>`,
      `<script type="application/ld+json">{"@context":"https://schema.org"}</script>`,
    ].join("");
    expect(inlineScriptHashes(html)).toEqual([]);
  });

  it("does not mistake a data-src attribute for an external script", () => {
    expect(inlineScriptHashes(`<script data-src="x">e()</script>`)).toEqual([sha256("e()")]);
  });
  it("ends a script at an end tag followed by whitespace, a slash, or any letter case", () => {
    const html = [
      `<script>a()</script >`,
      `<script>b()</SCRIPT>`,
      "<script>c()</script\n>",
      `<script>d()</script/>`,
      `<script>e()</ScRiPt\t>`,
    ].join("");
    expect(inlineScriptHashes(html)).toEqual(
      ["a()", "b()", "c()", "d()", "e()"].map((source) => sha256(source)).sort(),
    );
  });

  it("keeps a script open past text that only resembles an end tag", () => {
    const source = `var a = "</scripts>"; var b = "</scriptx";`;
    expect(inlineScriptHashes(`<script>${source}</script>`)).toEqual([sha256(source)]);
  });

  it("reads attributes whose quoted values contain a greater-than sign", () => {
    const html = [
      `<script data-note="a > b">f()</script>`,
      `<script data-note='x>' type="module">g()</script>`,
      `<script data-note="y>" src="/external.js"></script>`,
      `<script data-note="z>" type="application/ld+json">{"@type":"Thing"}</script>`,
    ].join("");
    expect(inlineScriptHashes(html)).toEqual(["f()", "g()"].map((source) => sha256(source)).sort());
  });

  it("hashes several scripts across head and body and skips every data block among them", () => {
    const html = [
      `<!doctype html><html><head><script>h()</script>`,
      `<script type="application/ld+json">{"@context":"https://schema.org"}</script></head>`,
      `<body><p>text</p><script>i()</script>`,
      `<script type="APPLICATION/LD+JSON">{"@type":"FAQPage"}</script><script>j()</script></body></html>`,
    ].join("");
    expect(inlineScriptHashes(html)).toEqual(
      ["h()", "i()", "j()"].map((source) => sha256(source)).sort(),
    );
  });

  it("hashes the built not-found page exactly as the regular-expression matcher did", async () => {
    const html = await readFile(
      new URL("./fixtures/built-not-found.html", import.meta.url),
      "utf8",
    );
    expect(inlineScriptHashes(html)).toEqual([
      "'sha256-8bLUN0ikzQ7FhO8rvkQoxcfdjiHRij9O823x1sDzxPk='",
      "'sha256-OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo='",
    ]);
  });

  it("hashes a built page with JSON-LD exactly as the regular-expression matcher did", async () => {
    const html = await readFile(new URL("./fixtures/built-contact.html", import.meta.url), "utf8");
    expect(inlineScriptHashes(html)).toEqual([
      "'sha256-OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo='",
      "'sha256-z44VHNpZ1BeZx91mgMddkC5OOTFml462X85hZMHsnIE='",
    ]);
  });
});

describe("htmlRoute", () => {
  it("maps a prerendered file to the pathname it is served at", () => {
    expect(htmlRoute("en.html")).toBe("/en");
    expect(htmlRoute(join("de", "docs", "quickstart.html"))).toBe("/de/docs/quickstart");
    expect(htmlRoute("_not-found.html")).toBe(NOT_FOUND_ROUTE);
    expect(htmlRoute("index.html")).toBe("/");
  });
});

describe("collectScriptHashes", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  });

  it("collects the hashes of every prerendered html file and nothing else", async () => {
    directory = await mkdtemp(join(tmpdir(), "csp-hashes-"));
    await mkdir(join(directory, "en", "docs"), { recursive: true });
    await writeFile(join(directory, "_not-found.html"), `<script>${BOOTSTRAP}</script>`);
    await writeFile(join(directory, "en", "docs", "quickstart.html"), `<script>${FLIGHT}</script>`);
    await writeFile(join(directory, "en", "docs", "quickstart.rsc"), `<script>ignored()</script>`);

    expect(await collectScriptHashes(directory)).toEqual({
      [NOT_FOUND_ROUTE]: [sha256(BOOTSTRAP)],
      "/en/docs/quickstart": [sha256(FLIGHT)],
    });
  });
});

describe("manifestProblems", () => {
  it("accepts a manifest whose every page, the not-found page included, has hashes", () => {
    expect(
      manifestProblems({ [NOT_FOUND_ROUTE]: [sha256(BOOTSTRAP)], "/en": [sha256(FLIGHT)] }),
    ).toEqual([]);
  });

  it("rejects a prerendered page without a hash, since every page carries the flight bootstrap", () => {
    expect(
      manifestProblems({ [NOT_FOUND_ROUTE]: [sha256(BOOTSTRAP)], "/en": [], "/de": [] }),
    ).toEqual(["no inline script hashed on /en", "no inline script hashed on /de"]);
  });

  it("rejects a manifest without the not-found page that unknown paths fall back to", () => {
    expect(manifestProblems({ "/en": [sha256(BOOTSTRAP)] })).toEqual([
      `no prerendered ${NOT_FOUND_ROUTE} page`,
    ]);
  });

  it("rejects an empty manifest", () => {
    expect(manifestProblems({})).toEqual([`no prerendered ${NOT_FOUND_ROUTE} page`]);
  });
});
