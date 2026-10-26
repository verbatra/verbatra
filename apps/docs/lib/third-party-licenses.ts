import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  BRAND_MARK_IDS,
  BRAND_MARK_SOURCES,
  BRAND_MARK_TRADEMARK_NOTE,
  BRAND_MARKS,
  brandMarkSourceUrl,
} from "./brand-marks.ts";
import { licenseTermsUrl } from "./license-terms.ts";

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

export type Manifest = {
  name?: unknown;
  version?: unknown;
  license?: unknown;
  licenses?: unknown;
  author?: unknown;
  dependencies?: unknown;
  optionalDependencies?: unknown;
  peerDependencies?: unknown;
};

export type PlatformLicense = {
  readonly license: string;
  readonly author: string | null;
};

export type PlatformLicenses = Readonly<Record<string, PlatformLicense>>;

export type Platform = {
  readonly os: ReadonlyArray<string>;
  readonly cpu: ReadonlyArray<string>;
  readonly libc: ReadonlyArray<string>;
};

export type Lockfile = {
  readonly platforms: ReadonlyMap<string, Platform>;
  readonly snapshots: ReadonlyMap<string, ReadonlyMap<string, string>>;
};

type DependencyKind = "dependency" | "optional" | "peer";

type QueueItem = {
  readonly from: string;
  readonly parent: string | null;
  readonly name: string;
  readonly kind: DependencyKind;
};

type PlatformLookup = (key: string) => PlatformLicense;

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

export const DEPLOY_TARGET: Platform = { os: ["linux"], cpu: ["x64"], libc: ["glibc"] };
export const PLATFORM_LICENSES_FILE = "lib/platform-licenses.json";
export const RESYNC_COMMAND = "pnpm --filter @verbatra/docs licenses:sync";

const STANDARD_TEXTS: Readonly<Record<string, ReadonlyArray<{ license: string; file: string }>>> = {
  "LGPL-3.0-or-later": [
    { license: "LGPL-3.0-or-later", file: "assets/licenses/LGPL-3.0.txt" },
    { license: "GPL-3.0-or-later", file: "assets/licenses/GPL-3.0.txt" },
  ],
  "MPL-2.0": [{ license: "MPL-2.0", file: "assets/licenses/MPL-2.0.txt" }],
};

function brandMarkAssetName(id: keyof typeof BRAND_MARKS): string {
  const mark = BRAND_MARKS[id];
  const source = BRAND_MARK_SOURCES[mark.source];
  return `${mark.title} mark (${source.package}@${source.version}, ${mark.file})`;
}

const CARD_ONLY_MARK_IDS: ReadonlyArray<string> = [
  "react",
  "fontawesomeVuejs",
  "deviconNuxt",
  "deviconDotnet",
];
const STACK_CARD_MARK_IDS: ReadonlyArray<string> = [
  "angular",
  "android",
  "fontawesomeApple",
  "fontawesomeFlutter",
  "deviconSpring",
  "deviconNextjs",
  ...CARD_ONLY_MARK_IDS,
];

function brandMarkSurfaces(id: string): string {
  const onCards = STACK_CARD_MARK_IDS.includes(id);
  const onMarquee = !CARD_ONLY_MARK_IDS.includes(id);
  if (onCards && onMarquee) return "the landing marquee and the stack cards";
  return onCards ? "the stack cards" : "the landing marquee";
}

const BRAND_MARK_ASSETS: ReadonlyArray<AssetSource> = BRAND_MARK_IDS.map((id) => {
  const mark = BRAND_MARKS[id];
  return {
    name: brandMarkAssetName(id),
    license: mark.license,
    usage: `Inline monochrome SVG path in ${brandMarkSurfaces(id)}, copied from ${brandMarkSourceUrl(mark)}. ${BRAND_MARK_TRADEMARK_NOTE}`,
    textFile: null,
    copyright: mark.attribution,
  };
});

const ASSET_SOURCES: ReadonlyArray<AssetSource> = [
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
  ...BRAND_MARK_ASSETS,
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

export function authorOf(manifest: Manifest): string | null {
  if (typeof manifest.author === "string") return manifest.author.replace(/\s*[<(].*$/, "");
  if (manifest.author !== null && typeof manifest.author === "object") {
    const name = (manifest.author as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

function isReadableFile(dir: string, name: string): boolean {
  try {
    return statSync(join(dir, name)).isFile();
  } catch {
    return false;
  }
}

export function readMatching(dir: string, pattern: RegExp): string | null {
  const files = readdirSync(dir)
    .filter((name) => pattern.test(name) && isReadableFile(dir, name))
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

function resolveSibling(fromDir: string, name: string): string | null {
  const parent = dirname(fromDir);
  const nodeModules = basename(parent).startsWith("@") ? dirname(parent) : parent;
  if (basename(nodeModules) !== "node_modules") return null;
  const candidate = join(nodeModules, name);
  return existsSync(join(candidate, "package.json")) ? realpathSync(candidate) : null;
}

function namesIn(field: unknown): string[] {
  if (field === null || typeof field !== "object") return [];
  return Object.keys(field as Record<string, unknown>);
}

function unquote(value: string): string {
  return value.replace(/^'(.*)'$/, "$1");
}

function listOf(value: string): string[] {
  return value.split(",").map((item) => unquote(item.trim()));
}

type LockfileSection = "packages" | "snapshots" | null;

class LockfileParser {
  readonly platforms = new Map<string, { os: string[]; cpu: string[]; libc: string[] }>();
  readonly snapshots = new Map<string, Map<string, string>>();
  private section: LockfileSection = null;
  private entry: string | null = null;
  private inDependencies = false;

  line(line: string): void {
    if (/^\S/.test(line)) {
      this.section = line === "packages:" ? "packages" : line === "snapshots:" ? "snapshots" : null;
      this.entry = null;
      return;
    }
    if (this.section === null) return;
    const entry = /^ {2}(\S.*?):(?: \{\})?$/.exec(line);
    if (entry?.[1] !== undefined) {
      this.entry = unquote(entry[1]);
      this.inDependencies = false;
      return;
    }
    if (this.entry === null) return;
    if (this.section === "packages") this.packageField(this.entry, line);
    else this.snapshotField(this.entry, line);
  }

  private packageField(entry: string, line: string): void {
    const field = /^ {4}(os|cpu|libc): \[(.*)\]$/.exec(line);
    if (field?.[1] === undefined || field[2] === undefined) return;
    const platform = this.platforms.get(entry) ?? { os: [], cpu: [], libc: [] };
    platform[field[1] as keyof Platform] = listOf(field[2]);
    this.platforms.set(entry, platform);
  }

  private snapshotField(entry: string, line: string): void {
    if (/^ {4}\S/.test(line)) {
      this.inDependencies = /^ {4}(?:dependencies|optionalDependencies):$/.test(line);
      return;
    }
    const dependency = /^ {6}(\S.*?): (\S+)$/.exec(line);
    if (!this.inDependencies || dependency?.[1] === undefined || dependency[2] === undefined)
      return;
    const base = entry.replace(/\(.*$/, "");
    const deps = this.snapshots.get(base) ?? new Map<string, string>();
    deps.set(unquote(dependency[1]), unquote(dependency[2]).replace(/\(.*$/, ""));
    this.snapshots.set(base, deps);
  }
}

export function parseLockfile(text: string): Lockfile {
  const parser = new LockfileParser();
  for (const line of text.split(/\r?\n/)) parser.line(line);
  return { platforms: parser.platforms, snapshots: parser.snapshots };
}

function findLockfile(appDir: string): Lockfile {
  let current = appDir;
  while (true) {
    const candidate = join(current, "pnpm-lock.yaml");
    if (existsSync(candidate)) return parseLockfile(readFileSync(candidate, "utf8"));
    const parent = dirname(current);
    if (parent === current) return { platforms: new Map(), snapshots: new Map() };
    current = parent;
  }
}

function allows(constraint: ReadonlyArray<string>, value: string | undefined): boolean {
  if (constraint.length === 0 || value === undefined) return true;
  const excluded = constraint.filter((item) => item.startsWith("!")).map((item) => item.slice(1));
  if (excluded.includes(value)) return false;
  const included = constraint.filter((item) => !item.startsWith("!"));
  return included.length === 0 || included.includes(value);
}

export function matchesTarget(platform: Platform, target: Platform = DEPLOY_TARGET): boolean {
  return (
    allows(platform.os, target.os[0]) &&
    allows(platform.cpu, target.cpu[0]) &&
    allows(platform.libc, target.libc[0])
  );
}

function splitKey(key: string): { name: string; version: string } {
  const at = key.lastIndexOf("@");
  return { name: key.slice(0, at), version: key.slice(at + 1) };
}

class PackageCollector {
  readonly collected = new Map<string, CollectedPackage>();
  private readonly visited = new Set<string>();
  private readonly queue: QueueItem[] = [];

  private readonly lock: Lockfile;
  private readonly platformLicense: PlatformLookup;

  constructor(lock: Lockfile, platformLicense: PlatformLookup) {
    this.lock = lock;
    this.platformLicense = platformLicense;
  }

  run(appDir: string): CollectedPackage[] {
    for (const name of namesIn(readManifest(appDir).dependencies)) {
      this.queue.push({ from: appDir, parent: null, name, kind: "dependency" });
    }
    let next = this.queue.shift();
    while (next !== undefined) {
      this.visit(next);
      next = this.queue.shift();
    }
    return [...this.collected.values()];
  }

  private lockedKey(parent: string | null, name: string): string | null {
    if (parent === null) return null;
    const version = this.lock.snapshots.get(parent)?.get(name);
    return version === undefined ? null : `${name}@${version}`;
  }

  private visit(item: QueueItem): void {
    const locked = this.lockedKey(item.parent, item.name);
    const platform = locked === null ? undefined : this.lock.platforms.get(locked);
    if (locked !== null && platform !== undefined) {
      if (matchesTarget(platform)) this.addPlatformPackage(locked);
      return;
    }
    const dir =
      item.kind === "dependency"
        ? resolveDependency(item.from, item.name)
        : resolveSibling(item.from, item.name);
    if (dir === null) {
      if (item.kind === "dependency")
        throw new Error(`Cannot resolve ${item.name} from ${item.from}`);
      return;
    }
    if (this.visited.has(dir)) return;
    this.visited.add(dir);
    this.addInstalledPackage(dir, item.name);
  }

  private addInstalledPackage(dir: string, fallbackName: string): void {
    const manifest = readManifest(dir);
    const name = typeof manifest.name === "string" ? manifest.name : fallbackName;
    const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";
    const key = `${name}@${version}`;
    this.collected.set(key, {
      name,
      version,
      license: licenseOf(manifest),
      author: authorOf(manifest),
      licenseText: readMatching(dir, LICENSE_FILE),
      notice: readMatching(dir, NOTICE_FILE),
    });
    const fields: ReadonlyArray<[DependencyKind, unknown]> = [
      ["dependency", manifest.dependencies],
      ["optional", manifest.optionalDependencies],
      ["peer", manifest.peerDependencies],
    ];
    for (const [kind, field] of fields) {
      for (const dependency of namesIn(field)) {
        this.queue.push({ from: dir, parent: key, name: dependency, kind });
      }
    }
  }

  private addPlatformPackage(key: string): void {
    if (this.collected.has(key)) return;
    const { name, version } = splitKey(key);
    const { license, author } = this.platformLicense(key);
    this.collected.set(key, { name, version, license, author, licenseText: null, notice: null });
    for (const [dependency, depVersion] of this.lock.snapshots.get(key) ?? []) {
      const depKey = `${dependency}@${depVersion}`;
      const platform = this.lock.platforms.get(depKey);
      if (platform === undefined) {
        throw new Error(`${key} depends on ${depKey}, which is not platform-specific`);
      }
      if (matchesTarget(platform)) this.addPlatformPackage(depKey);
    }
  }
}

function readPlatformLicenses(appDir: string): PlatformLicenses {
  const file = join(appDir, PLATFORM_LICENSES_FILE);
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as PlatformLicenses;
}

function committedPlatformLicense(appDir: string): PlatformLookup {
  const known = readPlatformLicenses(appDir);
  return (key) => {
    const entry = known[key];
    if (entry === undefined) {
      throw new Error(`${PLATFORM_LICENSES_FILE} has no entry for ${key}: run ${RESYNC_COMMAND}`);
    }
    return entry;
  };
}

export function listDeployedPlatformPackages(appDir: string): string[] {
  const keys: string[] = [];
  new PackageCollector(findLockfile(appDir), (key) => {
    keys.push(key);
    return { license: "UNKNOWN", author: null };
  }).run(appDir);
  return keys.sort();
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

function compareNumericParts(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = Number(left[index] ?? 0) - Number(right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function compareVersions(a: string, b: string): number {
  const [aCore = "", aPre] = a.split(/-(.*)/s);
  const [bCore = "", bPre] = b.split(/-(.*)/s);
  const core = compareNumericParts(aCore, bCore);
  if (core !== 0) return core;
  if (aPre === bPre) return 0;
  if (aPre === undefined) return 1;
  if (bPre === undefined) return -1;
  return aPre < bPre ? -1 : 1;
}

function byName(a: CollectedPackage, b: CollectedPackage): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return compareVersions(a.version, b.version);
}

class TextRegistry {
  readonly texts: LicenseText[] = [];
  private readonly ids = new Map<string, string>();

  private readonly appDir: string;

  constructor(appDir: string) {
    this.appDir = appDir;
  }

  standardIds(license: string): string[] {
    return (STANDARD_TEXTS[license] ?? []).flatMap((entry) => {
      const raw = readFileSync(join(this.appDir, entry.file), "utf8");
      const id = this.idFor(entry.license, raw.replace(/\r\n?/g, "\n").trim());
      return id === null ? [] : [id];
    });
  }

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

function fallbackTextIds(
  license: string,
  own: ReadonlyArray<string>,
  registry: TextRegistry,
): string[] {
  const [first] = own;
  if (first !== undefined) return [first];
  return licenseIds(license).flatMap((id) => {
    const text = registry.texts.find((candidate) => candidate.license === id);
    return text === undefined ? registry.standardIds(id) : [text.id];
  });
}

export function buildThirdPartyLicenses(
  appDir: string,
  platformLicense: PlatformLookup = committedPlatformLicense(appDir),
): ThirdPartyLicenses {
  const packages = new PackageCollector(findLockfile(appDir), platformLicense).run(appDir);
  const registry = new TextRegistry(appDir);
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
      fallbackTextIds: needsFallback ? fallbackTextIds(group.license, own, registry) : [],
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

function missingTextLine(group: LicenseGroup): string {
  const terms = licenseTermsUrl(group.license);
  return group.fallbackTextIds.length === 0 && terms !== null
    ? `  - No license file in the package; license terms: ${terms}`
    : `  - No license file in the package; license text: ${group.fallbackTextIds.join(", ")}`;
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
      lines.push(pkg.textId === null ? missingTextLine(group) : `  - License text: ${pkg.textId}`);
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
