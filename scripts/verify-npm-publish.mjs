#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const TARBALL_LICENSE_MEMBER = "package/LICENSE";
const TARBALL_MANIFEST_MEMBER = "package/package.json";

const MANIFEST_DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const UNRESOLVED_SPECIFIER_PATTERN = /^(?:workspace|catalog):/;

const PROPAGATION = {
  deadlineMs: 480_000,
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
  commandTimeoutMs: 45_000,
};

const COMMANDS_PER_ATTEMPT = 3;

const FATAL_SPAWN_CODES = new Set(["ENOENT", "EACCES"]);

const FATAL_NPM_ERROR_CODES = new Set([
  "E401",
  "E403",
  "EAUTHIP",
  "EAUTHUNKNOWN",
  "ENEEDAUTH",
  "EOTP",
  "EPERM",
]);

const run = promisify(execFile);

function parsePublishedPackages(raw) {
  if (!raw || raw.trim() === "") {
    throw new Error("PUBLISHED_PACKAGES_JSON is empty; nothing to verify.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PUBLISHED_PACKAGES_JSON is not valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      "changesets/action reported published=true but publishedPackages is empty or not an array; " +
        "the publish step's own output is inconsistent, treat this as a failure.",
    );
  }

  return parsed.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.name !== "string" ||
      typeof entry.version !== "string"
    ) {
      throw new Error(
        `publishedPackages[${index}] is missing a string name/version: ${JSON.stringify(entry)}`,
      );
    }
    return { name: entry.name, version: entry.version };
  });
}

const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isPrereleaseVersion(version) {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) {
    throw new Error(
      `"${version}" is not valid semver; cannot classify it as prerelease or stable.`,
    );
  }
  return match[1] !== undefined;
}

function isLatestTagViolation(publishedVersion, latestVersion) {
  return isPrereleaseVersion(publishedVersion) && latestVersion === publishedVersion;
}

function notYetOnRegistry(message) {
  const error = new Error(message);
  error.notYetOnRegistry = true;
  return error;
}

function isNotYetOnRegistry(error) {
  return error instanceof Error && error.notYetOnRegistry === true;
}

function npmErrorCode(error) {
  const streams = `${error?.stderr ?? ""}\n${error?.stdout ?? ""}`;
  return /npm error code (\S+)/.exec(streams)?.[1] ?? null;
}

function summarizeCommandFailure(error) {
  const code = npmErrorCode(error);
  if (code !== null) {
    return `npm ${code}`;
  }
  const streams = `${error?.stderr ?? ""}\n${error?.stdout ?? ""}`;
  const firstLine = streams
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "");
  const fallback = error instanceof Error ? error.message : String(error);
  return (firstLine ?? fallback).replace(/\s+/g, " ").trim();
}

function isDeterministicCommandFailure(error) {
  if (typeof error?.code === "string" && FATAL_SPAWN_CODES.has(error.code)) {
    return true;
  }
  const code = npmErrorCode(error);
  return code !== null && FATAL_NPM_ERROR_CODES.has(code);
}

function registryCommandError(error, { pending, fatal }) {
  const summary = summarizeCommandFailure(error);
  if (isDeterministicCommandFailure(error)) {
    return new Error(`${fatal} (${summary})`);
  }
  return notYetOnRegistry(`${pending} (${summary})`);
}

function backoffDelays({ deadlineMs, initialDelayMs, maxDelayMs }) {
  const delays = [];
  let waited = 0;
  let delay = initialDelayMs;
  while (waited + delay <= deadlineMs) {
    delays.push(delay);
    waited += delay;
    delay = Math.min(delay * 2, maxDelayMs);
  }
  return delays;
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function commandOptions(commandTimeoutMs) {
  return { encoding: "utf8", timeout: commandTimeoutMs };
}

async function readLatestDistTag(name, commandTimeoutMs) {
  let output;
  try {
    const result = await run(
      "npm",
      ["view", name, "dist-tags.latest", "--json"],
      commandOptions(commandTimeoutMs),
    );
    output = result.stdout.trim();
  } catch (error) {
    throw registryCommandError(error, {
      pending: `the registry does not serve dist-tags for ${name} yet`,
      fatal: `npm view failed for ${name} in a way that waiting cannot resolve`,
    });
  }
  if (output === "") {
    return null;
  }
  const latest = JSON.parse(output);
  return typeof latest === "string" ? latest : null;
}

function ranToCompletion(error) {
  return typeof error?.code === "number" && error.killed !== true;
}

async function readTarballMember(tarball, member, commandTimeoutMs) {
  try {
    const result = await run("tar", ["-xzOf", tarball, member], commandOptions(commandTimeoutMs));
    return result.stdout;
  } catch (error) {
    if (ranToCompletion(error)) {
      return null;
    }
    throw new Error(
      `tar could not be run to read ${member} from ${tarball}, so the tarball cannot be ` +
        `judged either way (${summarizeCommandFailure(error)})`,
    );
  }
}

async function downloadTarballMembers(spec, commandTimeoutMs) {
  const workDir = mkdtempSync(join(tmpdir(), "verbatra-license-"));
  try {
    try {
      await run(
        "npm",
        ["pack", spec, "--pack-destination", workDir, "--loglevel=error"],
        commandOptions(commandTimeoutMs),
      );
    } catch (error) {
      throw registryCommandError(error, {
        pending: `the published tarball for ${spec} is not downloadable yet`,
        fatal: `npm pack failed for ${spec} in a way that waiting cannot resolve`,
      });
    }
    const tarball = readdirSync(workDir)[0];
    if (tarball === undefined) {
      throw notYetOnRegistry(`npm pack produced no tarball for ${spec} yet.`);
    }
    const tarballPath = join(workDir, tarball);
    return {
      license: await readTarballMember(tarballPath, TARBALL_LICENSE_MEMBER, commandTimeoutMs),
      manifest: await readTarballMember(tarballPath, TARBALL_MANIFEST_MEMBER, commandTimeoutMs),
    };
  } finally {
    rmSync(workDir, { force: true, recursive: true });
  }
}

async function observePackage(pkg, { commandTimeoutMs }) {
  const latest = isPrereleaseVersion(pkg.version)
    ? await readLatestDistTag(pkg.name, commandTimeoutMs)
    : null;
  const members = await downloadTarballMembers(`${pkg.name}@${pkg.version}`, commandTimeoutMs);
  return { latest, license: members.license, manifest: members.manifest };
}

function worstCasePackageRuntimeMs({ deadlineMs, commandTimeoutMs }) {
  return deadlineMs + COMMANDS_PER_ATTEMPT * commandTimeoutMs;
}

function unavailableReport(pkg, attempts, elapsedMs, error) {
  return (
    `${pkg.name}@${pkg.version} is still not on npm after ${attempts} attempt(s) over ` +
    `${Math.round(elapsedMs / 1000)}s: ${error.message}`
  );
}

async function observeWithPropagation(
  pkg,
  { observe, delays, wait, log, now, deadlineMs, commandTimeoutMs },
) {
  const startedAt = now();
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { observation: await observe(pkg, { commandTimeoutMs }) };
    } catch (error) {
      if (!isNotYetOnRegistry(error)) {
        throw error;
      }
      const elapsedMs = now() - startedAt;
      const delay = delays[attempt - 1];
      if (delay === undefined || elapsedMs + delay > deadlineMs) {
        return { unavailable: unavailableReport(pkg, attempt, elapsedMs, error) };
      }
      log(
        `verify-npm-publish: waiting for ${pkg.name}@${pkg.version} (attempt ${attempt} of ` +
          `${delays.length + 1}, ${error.message}); retrying in ${Math.round(delay / 1000)}s.`,
      );
      await wait(delay);
    }
  }
}

function normalizeLicenseText(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

function classifyLicense(tarballLicense, rootLicense) {
  if (tarballLicense === null) {
    return "missing";
  }
  return normalizeLicenseText(tarballLicense) === normalizeLicenseText(rootLicense)
    ? null
    : "mismatched";
}

function classifyManifest(manifestText) {
  if (manifestText === null) {
    return [`no ${TARBALL_MANIFEST_MEMBER} in the tarball`];
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return [`${TARBALL_MANIFEST_MEMBER} is not valid JSON`];
  }
  const unresolved = [];
  for (const field of MANIFEST_DEPENDENCY_FIELDS) {
    const block = manifest[field];
    if (typeof block !== "object" || block === null) {
      continue;
    }
    for (const [dependency, specifier] of Object.entries(block)) {
      if (typeof specifier === "string" && UNRESOLVED_SPECIFIER_PATTERN.test(specifier)) {
        unresolved.push(`${field}.${dependency} is "${specifier}"`);
      }
    }
  }
  return unresolved;
}

async function inspectPackage(pkg, rootLicense, deps) {
  const { observation, unavailable } = await observeWithPropagation(pkg, deps);
  if (unavailable !== undefined) {
    return { pkg, unavailable };
  }
  return {
    pkg,
    latestTagViolation: isLatestTagViolation(pkg.version, observation.latest),
    licenseProblem: classifyLicense(observation.license, rootLicense),
    manifestProblems: classifyManifest(observation.manifest),
  };
}

function verifyPackages(packages, rootLicense, overrides = {}) {
  const deps = {
    observe: observePackage,
    wait: sleep,
    log: console.log,
    now: Date.now,
    deadlineMs: PROPAGATION.deadlineMs,
    commandTimeoutMs: PROPAGATION.commandTimeoutMs,
    delays: backoffDelays(PROPAGATION),
    ...overrides,
  };
  return Promise.all(packages.map((pkg) => inspectPackage(pkg, rootLicense, deps)));
}

function reportUnavailable(results) {
  console.error(
    `verify-npm-publish: ${results.length} package(s) never became available on npm within the ` +
      "propagation deadline. This is a publish that did not fully land, not a bad artifact:",
  );
  for (const result of results) {
    console.error(`  ${result.unavailable}`);
  }
  console.error(
    "Check npmjs.com for the version and re-run the release job; npm metadata and the tarball " +
      "itself propagate separately, so a version that resolves but cannot be downloaded is still " +
      "an incomplete publish.",
  );
}

function reportLatestTagViolations(violations) {
  console.error(
    `verify-npm-publish: ${violations.length} prerelease package(s) published in this run took ` +
      "over the latest dist-tag:",
  );
  for (const pkg of violations) {
    console.error(`  ${pkg.name}@${pkg.version} (dist-tags.latest points at it)`);
  }
  console.error(
    "Repair the dist-tag on npmjs.com with `npm dist-tag add`. To prevent a recurrence, give a " +
      "new package its first stable release before entering pre mode; see the note on the publish " +
      "step in .github/workflows/release.yml.",
  );
}

function reportLicenseFindings(findings) {
  console.error(
    `verify-npm-publish: ${findings.length} package(s) published in this run are present on npm ` +
      "but invalid: their registry tarball does not carry the repository-root LICENSE:",
  );
  for (const finding of findings) {
    const detail =
      finding.problem === "missing"
        ? "no package/LICENSE in the tarball"
        : "package/LICENSE differs from the repository root LICENSE";
    console.error(`  ${finding.pkg.name}@${finding.pkg.version} (${detail})`);
  }
  console.error(
    "The published LICENSE is injected by `pnpm pack` from the workspace root, so this usually " +
      "means the release ran through a different packer (`npm pack` does not inject it) or the " +
      "root LICENSE changed. Republishing is the only fix; a published tarball cannot be amended.",
  );
}

function reportManifestFindings(findings) {
  console.error(
    `verify-npm-publish: ${findings.length} package(s) published in this run are present on npm ` +
      "but invalid: their published manifest still carries unresolved workspace protocols:",
  );
  for (const finding of findings) {
    console.error(`  ${finding.pkg.name}@${finding.pkg.version} (${finding.problems.join(", ")})`);
  }
  console.error(
    "pnpm rewrites `workspace:` and `catalog:` specifiers to real ranges when it packs, so this " +
      "means the release ran through a different packer. The published version is uninstallable " +
      "and can only be fixed by republishing.",
  );
}

function collectFindings(results) {
  const unavailable = results.filter((result) => result.unavailable !== undefined);
  const latestTagViolations = results
    .filter((result) => result.latestTagViolation === true)
    .map((result) => result.pkg);
  const licenseFindings = results
    .filter((result) => result.licenseProblem != null)
    .map((result) => ({ pkg: result.pkg, problem: result.licenseProblem }));
  const manifestFindings = results
    .filter((result) => result.manifestProblems !== undefined && result.manifestProblems.length > 0)
    .map((result) => ({ pkg: result.pkg, problems: result.manifestProblems }));
  return { unavailable, latestTagViolations, licenseFindings, manifestFindings };
}

function describeVerdict(result) {
  if (result.unavailable !== undefined) {
    return "NOT ON NPM";
  }
  const invalid =
    result.latestTagViolation === true ||
    result.licenseProblem != null ||
    result.manifestProblems.length > 0;
  return invalid ? "PROBLEM" : "ok";
}

function reportResults(results) {
  for (const result of results) {
    console.log(`  ${result.pkg.name}@${result.pkg.version} ... ${describeVerdict(result)}`);
  }
  const findings = collectFindings(results);
  if (findings.unavailable.length > 0) {
    reportUnavailable(findings.unavailable);
  }
  if (findings.latestTagViolations.length > 0) {
    reportLatestTagViolations(findings.latestTagViolations);
  }
  if (findings.licenseFindings.length > 0) {
    reportLicenseFindings(findings.licenseFindings);
  }
  if (findings.manifestFindings.length > 0) {
    reportManifestFindings(findings.manifestFindings);
  }
  const failed =
    findings.unavailable.length +
    findings.latestTagViolations.length +
    findings.licenseFindings.length +
    findings.manifestFindings.length;
  if (failed === 0) {
    console.log(
      "verify-npm-publish: every published version is downloadable from npm, no prerelease took " +
        "over the latest dist-tag, every tarball carries the root LICENSE and a manifest with no " +
        "unresolved workspace protocols.",
    );
  }
  return failed;
}

async function main() {
  const packages = parsePublishedPackages(process.env.PUBLISHED_PACKAGES_JSON);
  const rootLicense = readFileSync(resolve(REPO_ROOT, "LICENSE"), "utf8");
  const delays = backoffDelays(PROPAGATION);
  console.log(
    `verify-npm-publish: checking ${packages.length} published package(s), waiting up to ` +
      `${Math.round(PROPAGATION.deadlineMs / 1000)}s per package over ${delays.length + 1} ` +
      "attempts for npm propagation.",
  );
  const results = await verifyPackages(packages, rootLicense, { delays });
  if (reportResults(results) > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`verify-npm-publish: ${message}`);
    process.exitCode = 1;
  });
}

export {
  backoffDelays,
  classifyLicense,
  classifyManifest,
  isLatestTagViolation,
  isNotYetOnRegistry,
  isPrereleaseVersion,
  normalizeLicenseText,
  notYetOnRegistry,
  PROPAGATION,
  parsePublishedPackages,
  ranToCompletion,
  registryCommandError,
  verifyPackages,
  worstCasePackageRuntimeMs,
};
