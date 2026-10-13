import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type LicensedPackage = {
  readonly name: string;
  readonly version: string;
  readonly copyright: ReadonlyArray<string>;
  readonly author: string | null;
  readonly textId: string | null;
  readonly notice: string | null;
};

export type LicenseGroup = {
  readonly license: string;
  readonly packages: ReadonlyArray<LicensedPackage>;
  readonly fallbackTextIds: ReadonlyArray<string>;
};

export type LicenseText = {
  readonly id: string;
  readonly license: string;
  readonly text: string;
};

export type LicensedAsset = {
  readonly name: string;
  readonly license: string;
  readonly copyright: ReadonlyArray<string>;
  readonly usage: string;
  readonly textId: string | null;
};

export type ThirdPartyLicenses = {
  readonly packageCount: number;
  readonly groups: ReadonlyArray<LicenseGroup>;
  readonly assets: ReadonlyArray<LicensedAsset>;
  readonly texts: ReadonlyArray<LicenseText>;
};

type Manifest = {
  name?: unknown;
  version?: unknown;
  license?: unknown;
  licenses?: unknown;
  author?: unknown;
  dependencies?: unknown;
};

type CollectedPackage = {
  name: string;
  version: string;
  license: string;
  author: string | null;
  licenseText: string | null;
  notice: string | null;
};

type AssetSource = {
  name: string;
  license: string;
  usage: string;
  textFile: string | null;
  copyright: ReadonlyArray<string>;
};

const LICENSE_FILE = /^(?:licen[cs]e|copying)(?:[-._].*)?$/i;
const NOTICE_FILE = /^notice(?:\.(?:md|txt))?$/i;
const DATED_COPYRIGHT = /^(?:copyright\s*(?:\(c\)|©|\d{4})|\(c\)\s*\d{4}|©\s*\d{4})/i;
const HEADER_COPYRIGHT = /^(?:copyright\b|\(c\)|©)/i;
const TITLE_LINE = /^(?:the\s+)?[\w.-]*(?:\s+[\w.()-]+){0,4}\s+licen[cs]e(?:\s+\(\w+\))?:?$/i;
const TEMPLATE_COPYRIGHT = /\[yyyy\]|\{yyyy\}|<year>|\[name of copyright owner\]/i;

export const ASSET_SOURCES: ReadonlyArray<AssetSource> = [
  {
    name: "Geist and Geist Mono fonts",
    license: "OFL-1.1",
    usage:
      "Served as webfonts through next/font, and embedded in the social preview images (assets/og-fonts).",
    textFile: "assets/og-fonts/OFL-Geist.txt",
    copyright: [],
  },
  {
    name: "Screenshots (public/screenshots)",
    license: "MIT",
    usage: "Own work of the verbatra project, under the project's MIT license.",
    textFile: null,
    copyright: ["Copyright (c) Mario Kreitz"],
  },
  {
    name: "Contributor avatars (public/contributors)",
    license: "Owned by each contributor",
    usage: "GitHub profile images of the contributors, shown to credit them.",
    textFile: null,
    copyright: [],
  },
];

function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
}

function licenseOf(manifest: Manifest): string {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license !== null && typeof manifest.license === "object") {
    const type = (manifest.license as { type?: unknown }).type;
    if (typeof type === "string") return type;
  }
  if (Array.isArray(manifest.licenses)) {
    const types = manifest.licenses
      .map((entry: unknown) =>
        entry !== null && typeof entry === "object" ? (entry as { type?: unknown }).type : entry,
      )
      .filter((type): type is string => typeof type === "string");
    if (types.length > 0) return types.join(" OR ");
  }
  return "UNKNOWN";
}

function authorOf(manifest: Manifest): string | null {
  if (typeof manifest.author === "string") return manifest.author.replace(/\s*[<(].*$/, "");
  if (manifest.author !== null && typeof manifest.author === "object") {
    const name = (manifest.author as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

function readMatching(dir: string, pattern: RegExp): string | null {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) return null;
  return files
    .map((file) => readFileSync(join(dir, file), "utf8").replace(/\r\n?/g, "\n").trim())
    .join("\n\n");
}

function resolveDependency(fromDir: string, name: string): string | null {
  let current = fromDir;
  while (true) {
    const candidate =
      basename(current) === "node_modules"
        ? join(current, name)
        : join(current, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function dependencyNames(manifest: Manifest): string[] {
  const deps = manifest.dependencies;
  if (deps === null || typeof deps !== "object") return [];
  return Object.keys(deps as Record<string, unknown>);
}

export function collectPackages(appDir: string): CollectedPackage[] {
  const collected = new Map<string, CollectedPackage>();
  const visited = new Set<string>();
  const queue = dependencyNames(readManifest(appDir)).map((name) => ({ from: appDir, name }));
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    const dir = resolveDependency(next.from, next.name);
    if (dir === null) throw new Error(`Cannot resolve ${next.name} from ${next.from}`);
    if (visited.has(dir)) continue;
    visited.add(dir);
    const manifest = readManifest(dir);
    const name = typeof manifest.name === "string" ? manifest.name : next.name;
    const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";
    collected.set(`${name}@${version}`, {
      name,
      version,
      license: licenseOf(manifest),
      author: authorOf(manifest),
      licenseText: readMatching(dir, LICENSE_FILE),
      notice: readMatching(dir, NOTICE_FILE),
    });
    for (const dependency of dependencyNames(manifest)) queue.push({ from: dir, name: dependency });
  }
  return [...collected.values()];
}

function isCopyrightLine(line: string, inHeader: boolean): boolean {
  if (TEMPLATE_COPYRIGHT.test(line)) return false;
  return DATED_COPYRIGHT.test(line) || (inHeader && HEADER_COPYRIGHT.test(line));
}

function splitCopyright(text: string): { copyright: string[]; body: string } {
  const copyright: string[] = [];
  const body: string[] = [];
  let inHeader = true;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (isCopyrightLine(trimmed, inHeader)) {
      copyright.push(trimmed);
      continue;
    }
    if (trimmed.length > 0 && !TITLE_LINE.test(trimmed)) inHeader = false;
    body.push(line);
  }
  return {
    copyright,
    body: body
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

function textKey(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function byName<T extends { name: string; version?: string }>(a: T, b: T): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  const av = a.version ?? "";
  const bv = b.version ?? "";
  if (av === bv) return 0;
  return av < bv ? -1 : 1;
}

class TextRegistry {
  readonly texts: LicenseText[] = [];
  private readonly ids = new Map<string, string>();

  idFor(license: string, body: string): string | null {
    if (body.length === 0) return null;
    const key = `${license}\u0000${textKey(body)}`;
    const known = this.ids.get(key);
    if (known !== undefined) return known;
    const id = `text-${this.texts.length + 1}`;
    this.ids.set(key, id);
    this.texts.push({ id, license, text: body });
    return id;
  }
}

function groupPackages(packages: CollectedPackage[]): Map<string, CollectedPackage[]> {
  const groups = new Map<string, CollectedPackage[]>();
  for (const pkg of [...packages].sort(byName)) {
    const group = groups.get(pkg.license) ?? [];
    group.push(pkg);
    groups.set(pkg.license, group);
  }
  return groups;
}

function orderedGroups(groups: Map<string, CollectedPackage[]>): [string, CollectedPackage[]][] {
  return [...groups.entries()].sort(([a, pa], [b, pb]) => {
    if (pa.length !== pb.length) return pb.length - pa.length;
    return a < b ? -1 : 1;
  });
}

function assetsFrom(appDir: string, registry: TextRegistry): LicensedAsset[] {
  return ASSET_SOURCES.map((asset) => {
    if (asset.textFile === null) {
      return {
        name: asset.name,
        license: asset.license,
        copyright: asset.copyright,
        usage: asset.usage,
        textId: null,
      };
    }
    const raw = readFileSync(join(appDir, asset.textFile), "utf8").replace(/\r\n?/g, "\n").trim();
    const { copyright, body } = splitCopyright(raw);
    return {
      name: asset.name,
      license: asset.license,
      copyright: [...asset.copyright, ...copyright],
      usage: asset.usage,
      textId: registry.idFor(asset.license, body),
    };
  });
}

function licenseIds(expression: string): string[] {
  return expression.match(/[A-Za-z0-9.+-]+/g)?.filter((id) => !/^(?:AND|OR|WITH)$/.test(id)) ?? [];
}

function fallbackTextIds(license: string, own: ReadonlyArray<string>, texts: LicenseText[]) {
  if (own.length > 0) return [own[0] as string];
  return licenseIds(license).flatMap((id) => {
    const text = texts.find((candidate) => candidate.license === id);
    return text === undefined ? [] : [text.id];
  });
}

export function buildThirdPartyLicenses(appDir: string): ThirdPartyLicenses {
  const packages = collectPackages(appDir);
  const registry = new TextRegistry();
  const grouped = orderedGroups(groupPackages(packages)).map(([license, members]) => ({
    license,
    packages: members.map((pkg): LicensedPackage => {
      const split = pkg.licenseText === null ? null : splitCopyright(pkg.licenseText);
      return {
        name: pkg.name,
        version: pkg.version,
        copyright: split?.copyright ?? [],
        author: pkg.author,
        textId: split === null ? null : registry.idFor(license, split.body),
        notice: pkg.notice,
      };
    }),
  }));
  const groups: LicenseGroup[] = grouped.map((group) => {
    const own = group.packages.flatMap((pkg) => (pkg.textId === null ? [] : [pkg.textId]));
    const needsFallback = group.packages.some((pkg) => pkg.textId === null);
    return {
      ...group,
      fallbackTextIds: needsFallback ? fallbackTextIds(group.license, own, registry.texts) : [],
    };
  });
  const assets = assetsFrom(appDir, registry);
  return { packageCount: packages.length, groups, assets, texts: registry.texts };
}

function ownerLines(copyright: ReadonlyArray<string>, author: string | null): string[] {
  if (copyright.length > 0) return copyright.map((line) => `  - ${line}`);
  if (author !== null) return [`  - Author: ${author}`];
  return [];
}

export function renderThirdPartyNotices(data: ThirdPartyLicenses): string {
  const lines: string[] = [
    "# Third-party notices",
    "",
    "verbatra is licensed under the MIT license (see LICENSE). The documentation site in apps/docs",
    `ships ${data.packageCount} third-party packages from its production dependency closure, plus the`,
    "assets listed below. Each keeps its own license. This file is generated by",
    "`pnpm --filter @verbatra/docs licenses:sync`; do not edit it by hand. The same list is",
    "published at https://verbatra.kreitz-webdev.de/licenses.",
    "",
    "## Assets",
    "",
  ];
  for (const asset of data.assets) {
    lines.push(`- ${asset.name} (${asset.license}): ${asset.usage}`);
    lines.push(...asset.copyright.map((line) => `  - ${line}`));
    if (asset.textId !== null) lines.push(`  - License text: ${asset.textId}`);
  }
  for (const group of data.groups) {
    lines.push("", `## ${group.license} (${group.packages.length})`, "");
    for (const pkg of group.packages) {
      lines.push(`- ${pkg.name}@${pkg.version}`);
      lines.push(...ownerLines(pkg.copyright, pkg.author));
      lines.push(
        pkg.textId === null
          ? `  - No license file in the package; license text: ${group.fallbackTextIds.join(", ")}`
          : `  - License text: ${pkg.textId}`,
      );
      if (pkg.notice !== null) {
        lines.push("  - NOTICE:", "", "```text", pkg.notice, "```", "");
      }
    }
  }
  lines.push("", "## License texts", "");
  for (const text of data.texts) {
    lines.push(`### ${text.id} (${text.license})`, "", "```text", text.text, "```", "");
  }
  while (lines.at(-1) === "") lines.pop();
  return `${lines.join("\n")}\n`;
}
