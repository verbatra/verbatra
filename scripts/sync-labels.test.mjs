import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "sync-labels.sh");
const GITHUB_DEFAULTS = ["bug", "documentation", "duplicate", "enhancement", "invalid"];
const RENAMED = ["type: bug", "type: docs", "resolution: duplicate", "type: feature"];

const STUB_GH = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GH_STUB_LOG"
if [ "$1 $2" = "label list" ]; then
  cat "$GH_STUB_LABELS"
fi
`;

const sandboxes = [];

function runAgainst(labels, args = ["verbatra/example"]) {
  const sandbox = mkdtempSync(join(tmpdir(), "verbatra-sync-labels-"));
  sandboxes.push(sandbox);
  const stub = join(sandbox, "gh");
  writeFileSync(stub, STUB_GH);
  chmodSync(stub, 0o755);
  writeFileSync(join(sandbox, "labels.txt"), labels.map((name) => `${name}\n`).join(""));
  const log = join(sandbox, "calls.log");
  writeFileSync(log, "");
  const result = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${sandbox}:${process.env.PATH}`,
      GH_STUB_LOG: log,
      GH_STUB_LABELS: join(sandbox, "labels.txt"),
    },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { result, calls };
}

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

describe("scripts/sync-labels.sh", () => {
  it("refuses to run without a repository argument", () => {
    const { result, calls } = runAgainst(GITHUB_DEFAULTS, []);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("usage");
    expect(calls).toEqual([]);
  });

  it("renames GitHub's default labels into the prefixed scheme", () => {
    const { result, calls } = runAgainst(GITHUB_DEFAULTS);
    expect(result.status, result.stderr).toBe(0);
    const edits = calls.filter((call) => call.startsWith("label edit"));
    expect(edits).toEqual([
      "label edit bug -R verbatra/example --name type: bug",
      "label edit enhancement -R verbatra/example --name type: feature",
      "label edit documentation -R verbatra/example --name type: docs",
      "label edit duplicate -R verbatra/example --name resolution: duplicate",
      "label edit invalid -R verbatra/example --name resolution: invalid",
    ]);
  });

  it("renames nothing on a second run", () => {
    const { result, calls } = runAgainst([...RENAMED, "resolution: invalid"]);
    expect(result.status, result.stderr).toBe(0);
    expect(calls.filter((call) => call.startsWith("label edit"))).toEqual([]);
  });

  it("only upserts with --force, against the named repository", () => {
    const { calls } = runAgainst(RENAMED);
    const creates = calls.filter((call) => call.startsWith("label create"));
    expect(creates.length).toBeGreaterThan(20);
    for (const call of creates) {
      expect(call).toContain("-R verbatra/example --force --color ");
    }
    expect(creates).toContain(
      "label create needs triage -R verbatra/example --force --color e4e669 --description Not looked at yet",
    );
  });
});
