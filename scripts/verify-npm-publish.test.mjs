import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  backoffDelays,
  classifyLicense,
  classifyManifest,
  isLatestTagViolation,
  isPrereleaseVersion,
  normalizeLicenseText,
  notYetOnRegistry,
  PROPAGATION,
  parsePublishedPackages,
  verifyPackages,
} from "./verify-npm-publish.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_LICENSE = readFileSync(resolve(REPO_ROOT, "LICENSE"), "utf8");

const RELEASE_WORKFLOW = readFileSync(resolve(REPO_ROOT, ".github/workflows/release.yml"), "utf8");

const SDK = { name: "@verbatra/sdk", version: "0.11.0" };
const CLI = { name: "@verbatra/cli", version: "0.11.0" };

const CLEAN_MANIFEST = JSON.stringify({
  name: "@verbatra/sdk",
  version: "0.11.0",
  dependencies: { zod: "^4.1.11" },
  devDependencies: { typescript: "5.9.3" },
});

const UNRESOLVED_MANIFEST = JSON.stringify({
  name: "@verbatra/mcp",
  version: "0.2.0",
  dependencies: { "@verbatra/sdk": "workspace:*", zod: "catalog:" },
  devDependencies: { "@types/node": "catalog:", "@verbatra/core": "workspace:*" },
});

function readyObservation(overrides = {}) {
  return { latest: null, license: ROOT_LICENSE, manifest: CLEAN_MANIFEST, ...overrides };
}

function tarballNotThereYet(pkg) {
  return notYetOnRegistry(
    `the published tarball for ${pkg.name}@${pkg.version} is not downloadable yet (npm E404)`,
  );
}

function stubVerify(observe, overrides = {}) {
  const logs = [];
  const waits = [];
  const deps = {
    observe,
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    log: (line) => logs.push(line),
    delays: [2000, 2000, 2000],
    ...overrides,
  };
  return { deps, logs, waits };
}

describe("parsePublishedPackages", () => {
  it("parses a valid publishedPackages payload", () => {
    const raw = JSON.stringify([
      { name: "@verbatra/sdk", version: "0.5.0" },
      { name: "@verbatra/cli", version: "0.5.0" },
    ]);

    expect(parsePublishedPackages(raw)).toEqual([
      { name: "@verbatra/sdk", version: "0.5.0" },
      { name: "@verbatra/cli", version: "0.5.0" },
    ]);
  });

  it("throws when the input is undefined", () => {
    expect(() => parsePublishedPackages(undefined)).toThrow(
      "PUBLISHED_PACKAGES_JSON is empty; nothing to verify.",
    );
  });

  it("throws when the input is an empty or blank string", () => {
    expect(() => parsePublishedPackages("")).toThrow(
      "PUBLISHED_PACKAGES_JSON is empty; nothing to verify.",
    );
    expect(() => parsePublishedPackages("   ")).toThrow(
      "PUBLISHED_PACKAGES_JSON is empty; nothing to verify.",
    );
  });

  it("throws when the input is not valid JSON", () => {
    expect(() => parsePublishedPackages("{not json")).toThrow(
      "PUBLISHED_PACKAGES_JSON is not valid JSON",
    );
  });

  it("throws when the parsed JSON is not an array", () => {
    expect(() => parsePublishedPackages(JSON.stringify({ name: "@verbatra/sdk" }))).toThrow(
      "publishedPackages is empty or not an array",
    );
  });

  it("throws when the parsed JSON is an empty array", () => {
    expect(() => parsePublishedPackages("[]")).toThrow(
      "publishedPackages is empty or not an array",
    );
  });

  it("throws when an entry is missing the name or version field", () => {
    expect(() => parsePublishedPackages(JSON.stringify([{ name: "@verbatra/sdk" }]))).toThrow(
      "publishedPackages[0] is missing a string name/version",
    );
    expect(() =>
      parsePublishedPackages(JSON.stringify([{ name: "@verbatra/sdk", version: 5 }])),
    ).toThrow("publishedPackages[0] is missing a string name/version");
  });

  it("throws when an entry is not an object", () => {
    expect(() => parsePublishedPackages(JSON.stringify(["@verbatra/sdk"]))).toThrow(
      "publishedPackages[0] is missing a string name/version",
    );
    expect(() => parsePublishedPackages(JSON.stringify([null]))).toThrow(
      "publishedPackages[0] is missing a string name/version",
    );
  });
});

describe("isPrereleaseVersion", () => {
  it("classifies stable versions as non-prerelease", () => {
    expect(isPrereleaseVersion("0.4.4")).toBe(false);
    expect(isPrereleaseVersion("1.0.0")).toBe(false);
  });

  it("classifies versions with a prerelease component as prerelease", () => {
    expect(isPrereleaseVersion("0.1.0-next.7")).toBe(true);
    expect(isPrereleaseVersion("1.0.0-rc.1")).toBe(true);
    expect(isPrereleaseVersion("2.0.0-alpha")).toBe(true);
  });

  it("ignores build metadata when classifying", () => {
    expect(isPrereleaseVersion("1.2.3+build.5")).toBe(false);
    expect(isPrereleaseVersion("1.2.3-rc.1+build.5")).toBe(true);
  });

  it("throws on a version that is not valid semver", () => {
    expect(() => isPrereleaseVersion("not-semver")).toThrow("is not valid semver");
    expect(() => isPrereleaseVersion("1.2")).toThrow("is not valid semver");
    expect(() => isPrereleaseVersion("")).toThrow("is not valid semver");
  });
});

describe("isLatestTagViolation", () => {
  it("flags a just-published prerelease that sits on the latest dist-tag", () => {
    expect(isLatestTagViolation("0.1.0-next.7", "0.1.0-next.7")).toBe(true);
  });

  it("passes when latest points at a stable version", () => {
    expect(isLatestTagViolation("0.5.0-next.5", "0.4.4")).toBe(false);
  });

  it("passes when latest is stuck on an older prerelease from before the guard", () => {
    expect(isLatestTagViolation("0.1.0-next.7", "0.1.0-next.6")).toBe(false);
  });

  it("passes for a stable publish even when latest points at it", () => {
    expect(isLatestTagViolation("0.5.0", "0.5.0")).toBe(false);
  });

  it("passes when the package has no latest dist-tag at all", () => {
    expect(isLatestTagViolation("0.1.0-next.1", null)).toBe(false);
  });
});

describe("normalizeLicenseText", () => {
  it("folds CRLF to LF so a tarball packed on another platform still matches", () => {
    expect(normalizeLicenseText("MIT License\r\n\r\nCopyright\r\n")).toBe(
      "MIT License\n\nCopyright",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeLicenseText("\n  MIT License  \n\n")).toBe("MIT License");
  });
});

describe("classifyLicense", () => {
  it("reports a tarball carrying no root LICENSE as missing", () => {
    expect(classifyLicense(null, ROOT_LICENSE)).toBe("missing");
  });

  it("reports a truncated LICENSE as mismatched", () => {
    expect(classifyLicense("MIT License\n", ROOT_LICENSE)).toBe("mismatched");
  });

  it("reports a wrong-holder LICENSE as mismatched", () => {
    expect(
      classifyLicense(ROOT_LICENSE.replace("Mario Kreitz", "Someone Else"), ROOT_LICENSE),
    ).toBe("mismatched");
  });

  it("passes the actual repository root LICENSE", () => {
    expect(classifyLicense(ROOT_LICENSE, ROOT_LICENSE)).toBeNull();
  });

  it("passes a copy that differs only by line endings and trailing whitespace", () => {
    const repacked = `${ROOT_LICENSE.replace(/\n/g, "\r\n")}\n\n`;

    expect(classifyLicense(repacked, ROOT_LICENSE)).toBeNull();
  });
});

describe("backoffDelays", () => {
  it("never schedules a wait that would overrun the deadline", () => {
    const delays = backoffDelays({ deadlineMs: 60_000, initialDelayMs: 2000, maxDelayMs: 30_000 });

    expect(delays.reduce((total, delay) => total + delay, 0)).toBeLessThanOrEqual(60_000);
  });

  it("grows exponentially from the initial delay and then holds at the cap", () => {
    const delays = backoffDelays({ deadlineMs: 200_000, initialDelayMs: 2000, maxDelayMs: 16_000 });

    expect(delays.slice(0, 5)).toEqual([2000, 4000, 8000, 16_000, 16_000]);
    expect(Math.max(...delays)).toBe(16_000);
  });

  it("probes quickly at the start, so a sub-second propagation lag costs seconds not minutes", () => {
    const delays = backoffDelays(PROPAGATION);

    expect(delays[0]).toBe(2000);
    expect(delays.length).toBeGreaterThan(10);
  });

  it("keeps the worst-case per-package wait inside the release job timeout", () => {
    const worstCaseMs = backoffDelays(PROPAGATION).reduce((total, delay) => total + delay, 0);
    const timeoutMinutes = Number(
      /verify-publish:[\s\S]*?timeout-minutes: (\d+)/.exec(RELEASE_WORKFLOW)?.[1],
    );

    expect(worstCaseMs).toBeLessThanOrEqual(PROPAGATION.deadlineMs);
    expect(timeoutMinutes).toBeGreaterThan(0);
    expect(worstCaseMs).toBeLessThan(timeoutMinutes * 60_000 * 0.75);
  });
});

describe("classifyManifest", () => {
  it("passes a manifest whose specifiers were rewritten to real ranges", () => {
    expect(classifyManifest(CLEAN_MANIFEST)).toEqual([]);
  });

  it("flags workspace: and catalog: specifiers across every dependency field", () => {
    const problems = classifyManifest(UNRESOLVED_MANIFEST);

    expect(problems).toEqual([
      'dependencies.@verbatra/sdk is "workspace:*"',
      'dependencies.zod is "catalog:"',
      'devDependencies.@types/node is "catalog:"',
      'devDependencies.@verbatra/core is "workspace:*"',
    ]);
  });

  it("flags a tarball that carries no manifest at all", () => {
    expect(classifyManifest(null)).toEqual(["no package/package.json in the tarball"]);
  });

  it("flags a manifest that is not valid JSON", () => {
    expect(classifyManifest("{not json")).toEqual(["package/package.json is not valid JSON"]);
  });
});

describe("verifyPackages propagation tolerance", () => {
  it("passes a package whose tarball only becomes downloadable on the third attempt", async () => {
    let attempts = 0;
    const { deps, waits } = stubVerify((pkg) => {
      attempts += 1;
      if (attempts < 3) {
        return Promise.reject(tarballNotThereYet(pkg));
      }
      return Promise.resolve(readyObservation());
    });

    const results = await verifyPackages([SDK], ROOT_LICENSE, deps);

    expect(attempts).toBe(3);
    expect(waits).toEqual([2000, 2000]);
    expect(results).toEqual([
      { pkg: SDK, latestTagViolation: false, licenseProblem: null, manifestProblems: [] },
    ]);
  });

  it("names the package, version and attempt number on every retry", async () => {
    let attempts = 0;
    const { deps, logs } = stubVerify((pkg) => {
      attempts += 1;
      return attempts < 3
        ? Promise.reject(tarballNotThereYet(pkg))
        : Promise.resolve(readyObservation());
    });

    await verifyPackages([SDK], ROOT_LICENSE, deps);

    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain("@verbatra/sdk@0.11.0");
    expect(logs[0]).toContain("attempt 1 of 4");
    expect(logs[0]).toContain("npm E404");
    expect(logs[1]).toContain("attempt 2 of 4");
  });

  it("fails a package that never appears, reporting attempts and elapsed wait", async () => {
    const { deps } = stubVerify((pkg) => Promise.reject(tarballNotThereYet(pkg)));

    const [result] = await verifyPackages([SDK], ROOT_LICENSE, deps);

    expect(result.unavailable).toContain("@verbatra/sdk@0.11.0");
    expect(result.unavailable).toContain("is still not on npm after 4 attempt(s) over 6s");
    expect(result.licenseProblem).toBeUndefined();
  });

  it("gives every package its own deadline, so one slow package does not spend another's budget", async () => {
    const attemptsByPackage = new Map();
    const { deps } = stubVerify((pkg) => {
      const attempts = (attemptsByPackage.get(pkg.name) ?? 0) + 1;
      attemptsByPackage.set(pkg.name, attempts);
      if (pkg.name === SDK.name) {
        return Promise.reject(tarballNotThereYet(pkg));
      }
      return Promise.resolve(readyObservation());
    });

    const results = await verifyPackages([SDK, CLI], ROOT_LICENSE, deps);

    expect(attemptsByPackage.get(SDK.name)).toBe(4);
    expect(attemptsByPackage.get(CLI.name)).toBe(1);
    expect(results[0]?.unavailable).toContain("@verbatra/sdk@0.11.0");
    expect(results[1]).toEqual({
      pkg: CLI,
      latestTagViolation: false,
      licenseProblem: null,
      manifestProblems: [],
    });
  });
});

describe("verifyPackages fail-fast conditions", () => {
  it("fails a downloadable tarball with no package/LICENSE without retrying it", async () => {
    let attempts = 0;
    const { deps, waits } = stubVerify(() => {
      attempts += 1;
      return Promise.resolve(readyObservation({ license: null }));
    });

    const [result] = await verifyPackages([SDK], ROOT_LICENSE, deps);

    expect(attempts).toBe(1);
    expect(waits).toEqual([]);
    expect(result.licenseProblem).toBe("missing");
    expect(result.unavailable).toBeUndefined();
  });

  it("fails a manifest carrying workspace: or catalog: specifiers without retrying it", async () => {
    let attempts = 0;
    const { deps, waits } = stubVerify(() => {
      attempts += 1;
      return Promise.resolve(readyObservation({ manifest: UNRESOLVED_MANIFEST }));
    });

    const [result] = await verifyPackages([SDK], ROOT_LICENSE, deps);

    expect(attempts).toBe(1);
    expect(waits).toEqual([]);
    expect(result.manifestProblems).toContain('dependencies.@verbatra/sdk is "workspace:*"');
  });

  it("fails a prerelease that took over the latest dist-tag without retrying it", async () => {
    let attempts = 0;
    const { deps } = stubVerify(() => {
      attempts += 1;
      return Promise.resolve(readyObservation({ latest: "0.12.0-next.1" }));
    });

    const [result] = await verifyPackages(
      [{ name: "@verbatra/sdk", version: "0.12.0-next.1" }],
      ROOT_LICENSE,
      deps,
    );

    expect(attempts).toBe(1);
    expect(result.latestTagViolation).toBe(true);
  });

  it("does not let the retry path mask an artifact that is invalid once it arrives", async () => {
    let attempts = 0;
    const { deps } = stubVerify((pkg) => {
      attempts += 1;
      return attempts < 3
        ? Promise.reject(tarballNotThereYet(pkg))
        : Promise.resolve(readyObservation({ license: null, manifest: UNRESOLVED_MANIFEST }));
    });

    const [result] = await verifyPackages([SDK], ROOT_LICENSE, deps);

    expect(attempts).toBe(3);
    expect(result.unavailable).toBeUndefined();
    expect(result.licenseProblem).toBe("missing");
    expect(result.manifestProblems.length).toBeGreaterThan(0);
  });

  it("reports a mismatched LICENSE as invalid rather than waiting it out", async () => {
    let attempts = 0;
    const { deps } = stubVerify(() => {
      attempts += 1;
      return Promise.resolve(readyObservation({ license: "MIT License\n" }));
    });

    const [result] = await verifyPackages([SDK], ROOT_LICENSE, deps);

    expect(attempts).toBe(1);
    expect(result.licenseProblem).toBe("mismatched");
  });

  it("does not retry an error that is not a propagation delay", async () => {
    let attempts = 0;
    const { deps } = stubVerify(() => {
      attempts += 1;
      return Promise.reject(new Error("npm is not installed"));
    });

    await expect(verifyPackages([SDK], ROOT_LICENSE, deps)).rejects.toThrow("npm is not installed");
    expect(attempts).toBe(1);
  });
});
