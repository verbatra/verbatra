export const VERSION_PACKAGES = ["cli", "studio", "mcp"];

export const PACKAGE_LINE = {
  "@verbatra/cli": "cli",
  "@verbatra/sdk": "cli",
  "@verbatra/studio": "studio",
  "@verbatra/mcp": "mcp",
};

export const VERSION_STORAGE_KEY = "docs-version";

export const DEFAULT_BADGE_PACKAGE = "@verbatra/cli";

const CHANGELOG_HEADING = /^## (\d+\.\d+\.\d+)[ \t]*$/gm;
const STABLE = /^(\d+)\.(\d+)\.(\d+)$/;
const LINE = /^(\d+)\.(\d+)$/;

export function parseVersion(version) {
  const match = STABLE.exec(version);
  if (match === null) throw new Error(`not a stable version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function parseLine(line) {
  const match = LINE.exec(line);
  if (match === null) throw new Error(`not a release line: ${line}`);
  return [Number(match[1]), Number(match[2])];
}

export function isLine(value) {
  return typeof value === "string" && LINE.test(value);
}

export function lineOf(version) {
  const [major, minor] = parseVersion(version);
  return `${major}.${minor}`;
}

export function compareLines(left, right) {
  const [leftMajor, leftMinor] = parseLine(left);
  const [rightMajor, rightMinor] = parseLine(right);
  return leftMajor - rightMajor || leftMinor - rightMinor;
}

export function nextLine(line) {
  const [major, minor] = parseLine(line);
  return major === 0 ? `0.${minor + 1}` : `${major + 1}.0`;
}

export function changelogVersions(changelog) {
  return [...changelog.matchAll(CHANGELOG_HEADING)].map((match) => match[1]);
}

export function releaseLines(versions) {
  return [...new Set(versions.map(lineOf))].sort((left, right) => compareLines(right, left));
}

export function packageReleases(changelog) {
  const versions = changelogVersions(changelog);
  const lines = releaseLines(versions);
  if (lines.length === 0) throw new Error("no stable release heading in the changelog");
  return { lines };
}

export function placeableLines(releases) {
  const [latest] = releases.lines;
  if (latest === undefined) return [];
  return [nextLine(latest), ...releases.lines];
}

export function badgeNewerThanLine(version, line) {
  const [major, minor, patch] = parseVersion(version);
  const [lineMajor, lineMinor] = parseLine(line);
  return (major - lineMajor || minor - lineMinor || patch) > 0;
}

export function placeBadge(pkg, version, releases) {
  const target = PACKAGE_LINE[pkg ?? DEFAULT_BADGE_PACKAGE];
  if (target === undefined) return undefined;
  if (!STABLE.test(version)) return undefined;
  const line = lineOf(version);
  if (!placeableLines(releases[target]).includes(line)) return undefined;
  const patch = parseVersion(version)[2];
  return { package: target, line, patch };
}

function lineSelector(line) {
  return `[data-vk-line="${line}"]`;
}

function revealedBy(picked, releases) {
  const newer = placeableLines(releases)
    .filter((line) => compareLines(line, picked) > 0)
    .map(lineSelector);
  return [...newer, `${lineSelector(picked)}[data-vk-patch]`];
}

export function versionPillCss(releases) {
  const rules = [".vk-available-from[data-vk-since],\n.vk-version-notice {\n  display: none;\n}\n"];
  const notices = [];
  for (const pkg of VERSION_PACKAGES) {
    for (const picked of releases[pkg].lines) {
      const pills = `.vk-available-from[data-vk-pkg="${pkg}"]:is(${revealedBy(picked, releases[pkg]).join(", ")})`;
      const root = `html[data-vk-${pkg}="${picked}"]`;
      rules.push(`${root} ${pills} {\n  display: inline-flex;\n}\n`);
      notices.push(`${root} #nd-page:has(${pills}) .vk-version-notice`);
    }
  }
  rules.push(`${notices.join(",\n")} {\n  display: block;\n}\n`);
  return rules.join("\n");
}
