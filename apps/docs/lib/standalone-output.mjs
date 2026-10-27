import { readdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const BUILD_ONLY_DIRECTORIES = ["scripts", "coverage", "e2e", "test-results", "test-support"];
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SKIPPED_TRACE_DIRECTORIES = new Set(["standalone", "cache", "dev"]);

function toPosix(path) {
  return path.split(sep).join("/");
}

export function isEnvFile(path) {
  const name = basename(path);
  return name === ".env" || name.startsWith(".env.");
}

export function isBuildOnlyFile(appRelativePath) {
  const path = toPosix(appRelativePath);
  if (isEnvFile(path)) return true;
  if (path.startsWith("../") || path.split("/").includes("node_modules")) return false;
  const [top] = path.split("/");
  return BUILD_ONLY_DIRECTORIES.includes(top ?? "") || TEST_FILE.test(path);
}

async function filesUnder(directory, skip) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return skip(entry.name) ? [] : filesUnder(path, skip);
      return [path];
    }),
  );
  return nested.flat();
}

export async function tracedBuildOnlyFiles(appDir) {
  const distDir = join(appDir, ".next");
  const traces = (await filesUnder(distDir, (name) => SKIPPED_TRACE_DIRECTORIES.has(name))).filter(
    (file) => file.endsWith(".nft.json"),
  );
  const leaks = new Set();
  for (const trace of traces) {
    const { files } = JSON.parse(await readFile(trace, "utf8"));
    for (const file of files) {
      const appRelative = relative(appDir, resolve(dirname(trace), file));
      if (isBuildOnlyFile(appRelative)) leaks.add(toPosix(appRelative));
    }
  }
  return [...leaks].sort();
}

function standaloneDir(appDir) {
  return join(appDir, ".next", "standalone");
}

const skipDependencies = (name) => name === "node_modules";

export async function standaloneBuildOnlyFiles(appDir, appPath) {
  const root = standaloneDir(appDir);
  const appRoot = join(root, appPath);
  return (await filesUnder(root, skipDependencies))
    .filter((file) => isEnvFile(file) || isBuildOnlyFile(relative(appRoot, file)))
    .map((file) => toPosix(relative(root, file)))
    .sort();
}

export async function removeStandaloneEnvFiles(appDir) {
  const root = standaloneDir(appDir);
  const envFiles = (await filesUnder(root, skipDependencies)).filter(isEnvFile);
  await Promise.all(envFiles.map((file) => rm(file, { force: true })));
  return envFiles.map((file) => toPosix(relative(root, file))).sort();
}
