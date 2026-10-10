import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parse } from "parse5";
import { NOT_FOUND_ROUTE } from "./script-hashes-manifest.mjs";

const EXECUTABLE_TYPES = new Set(["", "text/javascript", "application/javascript", "module"]);
const HTML_SUFFIX = ".html";

function attributeValue(element, name) {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function isExecutableInline(element) {
  if (attributeValue(element, "src") !== undefined) return false;
  const type = attributeValue(element, "type");
  return type === undefined || EXECUTABLE_TYPES.has(type.trim().toLowerCase());
}

function scriptText(element) {
  return element.childNodes
    .filter((child) => child.nodeName === "#text")
    .map((child) => child.value)
    .join("");
}

function* scriptElements(node) {
  if (node.nodeName === "script") yield node;
  for (const child of node.content?.childNodes ?? node.childNodes ?? []) {
    yield* scriptElements(child);
  }
}

export function scriptHash(source) {
  return `'sha256-${createHash("sha256").update(source, "utf8").digest("base64")}'`;
}

export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const element of scriptElements(parse(html))) {
    if (isExecutableInline(element)) hashes.add(scriptHash(scriptText(element)));
  }
  return [...hashes].sort();
}

export function htmlRoute(relativePath) {
  const route = relativePath.split(sep).join("/").slice(0, -HTML_SUFFIX.length);
  return route === "index" ? "/" : `/${route}`;
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(HTML_SUFFIX))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

export async function collectScriptHashes(appDirectory) {
  const routes = {};
  for (const file of await htmlFiles(appDirectory)) {
    routes[htmlRoute(relative(appDirectory, file))] = inlineScriptHashes(
      await readFile(file, "utf8"),
    );
  }
  return routes;
}

export function manifestProblems(routes) {
  const problems = [];
  if (routes[NOT_FOUND_ROUTE] === undefined) {
    problems.push(`no prerendered ${NOT_FOUND_ROUTE} page`);
  }
  for (const [route, hashes] of Object.entries(routes)) {
    if (hashes.length === 0) problems.push(`no inline script hashed on ${route}`);
  }
  return problems;
}
