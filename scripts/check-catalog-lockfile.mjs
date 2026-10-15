#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const LOCKFILE = "pnpm-lock.yaml";
const CATALOG_PROTOCOL = "catalog:";
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"];
const SECTIONS_BY_PRECEDENCE = ["devDependencies", "dependencies", "optionalDependencies"];
const ABSENT = "(absent)";

const IMPORTER_INDENT = 2;
const SECTION_INDENT = 4;
const DEPENDENCY_INDENT = 6;
const FIELD_INDENT = 8;

function unquote(value) {
  const single = /^'(.*)'$/.exec(value);
  if (single?.[1] !== undefined) {
    return single[1].replaceAll("''", "'");
  }
  const double = /^"(.*)"$/.exec(value);
  return double?.[1] ?? value;
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function keyOf(line) {
  const match = /^\s*('(?:[^']|'')*'|"[^"]*"|[^:\s][^:]*?):(?:\s+(.*))?$/.exec(line);
  if (match?.[1] === undefined) {
    return null;
  }
  return { key: unquote(match[1]), value: match[2] === undefined ? "" : unquote(match[2].trim()) };
}

function topLevelBlock(text, key) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === `${key}:`);
  if (start === -1) {
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() !== "" && indentOf(line) === 0);
  return end === -1 ? rest : rest.slice(0, end);
}

function recordSpecifier(state, entry) {
  if (entry.key === "specifier" && state.specifiers !== null && state.dependency !== null) {
    state.specifiers[state.dependency] = entry.value;
  }
}

const LINE_HANDLERS = {
  [IMPORTER_INDENT]: (state, entry) => {
    state.specifiers = {};
    state.importers[entry.key] = state.specifiers;
    state.inSection = false;
    state.dependency = null;
  },
  [SECTION_INDENT]: (state, entry) => {
    state.inSection = DEPENDENCY_SECTIONS.includes(entry.key);
    state.dependency = null;
  },
  [DEPENDENCY_INDENT]: (state, entry) => {
    state.dependency = state.inSection ? entry.key : null;
  },
  [FIELD_INDENT]: recordSpecifier,
};

function parseLockImporters(lockText) {
  const state = { importers: {}, specifiers: null, inSection: false, dependency: null };
  for (const line of topLevelBlock(lockText, "importers")) {
    const entry = line.trim() === "" ? null : keyOf(line);
    const handler = LINE_HANDLERS[indentOf(line)];
    if (entry !== null && handler !== undefined) {
      handler(state, entry);
    }
  }
  return state.importers;
}

function manifestSpecifiers(manifestJson) {
  const manifest = JSON.parse(manifestJson);
  const specifiers = {};
  for (const section of SECTIONS_BY_PRECEDENCE) {
    Object.assign(specifiers, manifest[section] ?? {});
  }
  return specifiers;
}

function isCatalog(specifier) {
  return typeof specifier === "string" && specifier.startsWith(CATALOG_PROTOCOL);
}

function usesCatalog(specifiers) {
  return Object.values(specifiers).some(isCatalog);
}

function findImporterGaps(lockImporters, manifestsByImporter) {
  const gaps = [];
  for (const importer of Object.keys(lockImporters)) {
    const manifest = manifestsByImporter[importer];
    if (manifest === null) {
      gaps.push({ importer, reason: "has no readable package.json" });
    } else if (usesCatalog(manifest) && Object.keys(lockImporters[importer]).length === 0) {
      gaps.push({
        importer,
        reason: "declares a catalog: dependency but has no parsed specifiers",
      });
    }
  }
  return gaps.sort((a, b) => a.importer.localeCompare(b.importer));
}

function findMismatches(lockImporters, manifestsByImporter) {
  const mismatches = [];
  for (const [importer, lockSpecifiers] of Object.entries(lockImporters)) {
    const manifest = manifestsByImporter[importer] ?? {};
    const names = new Set([...Object.keys(manifest), ...Object.keys(lockSpecifiers)]);
    for (const dependency of names) {
      const manifestSpec = manifest[dependency] ?? ABSENT;
      const lockSpec = lockSpecifiers[dependency] ?? ABSENT;
      if ((isCatalog(manifestSpec) || isCatalog(lockSpec)) && manifestSpec !== lockSpec) {
        mismatches.push({ importer, dependency, manifest: manifestSpec, lock: lockSpec });
      }
    }
  }
  return mismatches.sort(
    (a, b) => a.importer.localeCompare(b.importer) || a.dependency.localeCompare(b.dependency),
  );
}

function readManifest(root, importer) {
  const path = join(root, importer, "package.json");
  return existsSync(path) ? manifestSpecifiers(readFileSync(path, "utf8")) : null;
}

function checkRoot(root) {
  const lockPath = join(root, LOCKFILE);
  if (!existsSync(lockPath)) {
    throw new Error(`no ${LOCKFILE} in ${root}.`);
  }
  const lockImporters = parseLockImporters(readFileSync(lockPath, "utf8"));
  const importers = Object.keys(lockImporters).length;
  if (importers === 0) {
    throw new Error(
      `parsed no importers from ${LOCKFILE}; its format may have changed, so the guard cannot vouch for it.`,
    );
  }
  const manifestsByImporter = Object.fromEntries(
    Object.keys(lockImporters).map((importer) => [importer, readManifest(root, importer)]),
  );
  const gaps = findImporterGaps(lockImporters, manifestsByImporter);
  const gapImporters = new Set(gaps.map((gap) => gap.importer));
  const mismatches = findMismatches(lockImporters, manifestsByImporter).filter(
    (mismatch) => !gapImporters.has(mismatch.importer),
  );
  return { importers, gaps, mismatches };
}

function formatMismatch(mismatch) {
  return `  ${mismatch.importer} > ${mismatch.dependency}: manifest ${mismatch.manifest}, lockfile ${mismatch.lock}`;
}

function formatGap(gap) {
  return `  ${gap.importer}: ${gap.reason}`;
}

function reportGaps(gaps) {
  console.error(
    `check-catalog-lockfile: ${gaps.length} importer(s) in ${LOCKFILE} give the guard nothing to compare:`,
  );
  for (const gap of gaps) {
    console.error(formatGap(gap));
  }
  console.error(
    `\nRun \`pnpm install\` locally and commit ${LOCKFILE}; if it is already current, the lockfile format changed and this guard needs updating.`,
  );
  process.exitCode = 1;
}

function reportMismatches(mismatches) {
  console.error(
    `check-catalog-lockfile: ${mismatches.length} catalog specifier(s) in ${LOCKFILE} disagree with package.json:`,
  );
  for (const mismatch of mismatches) {
    console.error(formatMismatch(mismatch));
  }
  console.error(
    `\nRestore each lockfile specifier to the package.json value (e.g. 'catalog:'), or run \`pnpm install\` locally and commit ${LOCKFILE}.`,
  );
  process.exitCode = 1;
}

function main() {
  const root = resolve(process.argv[2] ?? REPO_ROOT);
  const { importers, gaps, mismatches } = checkRoot(root);
  if (gaps.length > 0) {
    reportGaps(gaps);
  }
  if (mismatches.length > 0) {
    reportMismatches(mismatches);
  }
  if (gaps.length === 0 && mismatches.length === 0) {
    console.log(
      `check-catalog-lockfile: every catalog specifier in ${importers} importer(s) matches its package.json.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check-catalog-lockfile: ${message}`);
    process.exitCode = 1;
  }
}

export { checkRoot, findImporterGaps, findMismatches, manifestSpecifiers, parseLockImporters };
