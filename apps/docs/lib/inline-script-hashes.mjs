import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const SCRIPT_HASHES_FILE = "csp-script-hashes.json";

export const NOT_FOUND_ROUTE = "/_not-found";

const SCRIPT_ELEMENT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_ATTRIBUTE = /(?:^|\s)src\s*=/i;
const TYPE_ATTRIBUTE = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
const EXECUTABLE_TYPES = new Set(["", "text/javascript", "application/javascript", "module"]);
const HTML_SUFFIX = ".html";

function isExecutableInline(attributes) {
  if (SRC_ATTRIBUTE.test(attributes)) return false;
  const type = TYPE_ATTRIBUTE.exec(attributes);
  if (type === null) return true;
  const value = (type[1] ?? type[2] ?? type[3] ?? "").trim().toLowerCase();
  return EXECUTABLE_TYPES.has(value);
}

export function scriptHash(source) {
  return `'sha256-${createHash("sha256").update(source, "utf8").digest("base64")}'`;
}

export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const [, attributes = "", source = ""] of html.matchAll(SCRIPT_ELEMENT)) {
    if (isExecutableInline(attributes)) hashes.add(scriptHash(source));
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
