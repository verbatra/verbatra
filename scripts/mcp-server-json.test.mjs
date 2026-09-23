import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  publishedVersionMismatches,
  renderServerJson,
  serverJsonMismatches,
  syncServerJson,
} from "./mcp-server-json.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = resolve(REPO_ROOT, "scripts/mcp-server-json.mjs");
const SERVER_JSON_TEXT = readFileSync(resolve(REPO_ROOT, "packages/mcp/server.json"), "utf8");
const SERVER_JSON = JSON.parse(SERVER_JSON_TEXT);
const MCP_MANIFEST = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "packages/mcp/package.json"), "utf8"),
);
const ROOT_MANIFEST = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
const RELEASE_WORKFLOW = readFileSync(resolve(REPO_ROOT, ".github/workflows/release.yml"), "utf8");
const KEY_ENV_VARS_SOURCE = readFileSync(
  resolve(REPO_ROOT, "packages/ai-providers/src/key-env-vars.ts"),
  "utf8",
);

const MANIFEST = {
  name: "@verbatra/mcp",
  version: "1.4.0",
  mcpName: "io.github.verbatra/verbatra",
};

function serverJsonFor(version) {
  return {
    name: "io.github.verbatra/verbatra",
    version,
    packages: [{ registryType: "npm", identifier: "@verbatra/mcp", version }],
  };
}

function runScript(mode, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, mode], {
    encoding: "utf8",
    env: { ...process.env, PUBLISHED_PACKAGES_JSON: "", ...env },
  });
}

function declaredKeyEnvVarNames(source) {
  return [...source.matchAll(/"([A-Z][A-Z0-9_]*_API_KEY)"/g)].map((match) => match[1]);
}

describe("packages/mcp/server.json: alignment with packages/mcp/package.json", () => {
  it("matches the mcp package name, version, and mcpName", () => {
    expect(serverJsonMismatches(SERVER_JSON, MCP_MANIFEST)).toEqual([]);
  });

  it("is already in the exact form the sync step writes, so a version bump only changes versions", () => {
    expect(renderServerJson(syncServerJson(SERVER_JSON, MCP_MANIFEST))).toBe(SERVER_JSON_TEXT);
  });

  it("passes the check mode of the script", () => {
    const result = runScript("check");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

describe("packages/mcp/server.json: official MCP Registry constraints", () => {
  it("names a GitHub namespace the release workflow's OIDC login can publish to", () => {
    expect(SERVER_JSON.name).toMatch(/^io\.github\.verbatra\/[a-zA-Z0-9._-]+$/);
  });

  it("uses the released 2025-12-11 server.json schema", () => {
    expect(SERVER_JSON.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    );
  });

  it("keeps the description and title within the schema's 100-character limit", () => {
    expect(SERVER_JSON.description.length).toBeGreaterThan(0);
    expect(SERVER_JSON.description.length).toBeLessThanOrEqual(100);
    expect(SERVER_JSON.title.length).toBeLessThanOrEqual(100);
  });

  it("describes one npm package from the public npm registry over stdio", () => {
    expect(SERVER_JSON.packages).toHaveLength(1);
    const [entry] = SERVER_JSON.packages;
    expect(entry).toMatchObject({
      registryType: "npm",
      registryBaseUrl: "https://registry.npmjs.org",
      transport: { type: "stdio" },
    });
  });

  it("declares every built-in provider key variable as an optional secret", () => {
    const declared = SERVER_JSON.packages[0].environmentVariables;
    const keyNames = declaredKeyEnvVarNames(KEY_ENV_VARS_SOURCE);
    expect(keyNames.length).toBeGreaterThan(0);
    for (const name of keyNames) {
      expect(declared).toContainEqual(
        expect.objectContaining({ name, isRequired: false, isSecret: true }),
      );
    }
    const secretNames = declared.filter((variable) => variable.isSecret).map((v) => v.name);
    expect(secretNames.sort()).toEqual([...keyNames].sort());
  });
});

describe("serverJsonMismatches: drift detection", () => {
  it("reports nothing for an aligned file", () => {
    expect(serverJsonMismatches(serverJsonFor("1.4.0"), MANIFEST)).toEqual([]);
  });

  it.each([
    ["top-level version", { ...serverJsonFor("1.4.0"), version: "1.3.0" }, /server.json version/],
    [
      "npm package version",
      { ...serverJsonFor("1.4.0"), packages: [{ ...serverJsonFor("1.3.0").packages[0] }] },
      /npm package version/,
    ],
    ["registry name", { ...serverJsonFor("1.4.0"), name: "io.github.verbatra/mcp" }, /mcpName/],
    [
      "npm identifier",
      {
        ...serverJsonFor("1.4.0"),
        packages: [{ registryType: "npm", identifier: "@verbatra/cli", version: "1.4.0" }],
      },
      /npm identifier/,
    ],
    ["missing npm package", { ...serverJsonFor("1.4.0"), packages: [] }, /0 npm packages/],
    [
      "absent packages field",
      { name: "io.github.verbatra/verbatra", version: "1.4.0" },
      /0 npm packages/,
    ],
  ])("reports a drifted %s", (_label, serverJson, pattern) => {
    const mismatches = serverJsonMismatches(serverJson, MANIFEST);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatch(pattern);
  });
});

describe("syncServerJson: the Changesets version step", () => {
  it("moves both version fields to the manifest version", () => {
    const synced = syncServerJson(serverJsonFor("1.3.0"), MANIFEST);
    expect(serverJsonMismatches(synced, MANIFEST)).toEqual([]);
  });

  it("leaves a package that is not the mcp npm package untouched", () => {
    const other = { registryType: "oci", identifier: "ghcr.io/verbatra/mcp", version: "0.0.1" };
    const synced = syncServerJson(
      { ...serverJsonFor("1.3.0"), packages: [...serverJsonFor("1.3.0").packages, other] },
      MANIFEST,
    );
    expect(synced.packages[1]).toEqual(other);
  });

  it("tolerates a file with no packages field", () => {
    const synced = syncServerJson(
      { name: "io.github.verbatra/verbatra", version: "1.3.0" },
      MANIFEST,
    );
    expect(synced).toMatchObject({ version: "1.4.0", packages: [] });
  });

  it("runs as part of the version script the release workflow hands to Changesets", () => {
    expect(ROOT_MANIFEST.scripts["version-packages"]).toBe(
      "changeset version && node scripts/mcp-server-json.mjs sync",
    );
    expect(RELEASE_WORKFLOW).toContain("version-script: pnpm version-packages");
  });
});

describe("publishedVersionMismatches: the release-time guard", () => {
  const published = (entries) => JSON.stringify(entries);

  it("accepts a published mcp version equal to server.json", () => {
    expect(
      publishedVersionMismatches(
        serverJsonFor("1.4.0"),
        published([{ name: "@verbatra/mcp", version: "1.4.0" }]),
        "@verbatra/mcp",
      ),
    ).toEqual([]);
  });

  it("rejects a published mcp version that differs from server.json", () => {
    const [mismatch] = publishedVersionMismatches(
      serverJsonFor("1.3.0"),
      published([{ name: "@verbatra/mcp", version: "1.4.0" }]),
      "@verbatra/mcp",
    );
    expect(mismatch).toMatch(/@verbatra\/mcp@1\.4\.0/);
  });

  it("rejects a run that did not publish the mcp package", () => {
    const [mismatch] = publishedVersionMismatches(
      serverJsonFor("1.4.0"),
      published([{ name: "@verbatra/sdk", version: "1.4.0" }]),
      "@verbatra/mcp",
    );
    expect(mismatch).toMatch(/not in PUBLISHED_PACKAGES_JSON/);
  });

  it("rejects a value that is not an array", () => {
    expect(
      publishedVersionMismatches(serverJsonFor("1.4.0"), '{"name":"x"}', "@verbatra/mcp"),
    ).toEqual(["PUBLISHED_PACKAGES_JSON is not an array"]);
  });
});

describe("mcp-server-json script: command line", () => {
  it("fails the check when the published version differs", () => {
    const result = runScript("check", {
      PUBLISHED_PACKAGES_JSON: JSON.stringify([{ name: "@verbatra/mcp", version: "999.0.0" }]),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/999\.0\.0/);
  });

  it("passes the check when the published version matches", () => {
    const result = runScript("check", {
      PUBLISHED_PACKAGES_JSON: JSON.stringify([
        { name: "@verbatra/mcp", version: MCP_MANIFEST.version },
      ]),
    });
    expect(result.status).toBe(0);
  });

  it("rejects an unknown mode", () => {
    const result = runScript("publish");
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/unknown mode/);
  });
});
