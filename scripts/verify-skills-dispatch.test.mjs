import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE = parse(readFileSync(resolve(REPO_ROOT, ".github/workflows/release.yml"), "utf8"));
const JOB = RELEASE.jobs["dispatch-skills-parity"];
const STEPS = JOB?.steps ?? [];
const APP_TOKEN_ACTION = "actions/create-github-app-token@";
const REQUIRED_SECRETS = ["SKILLS_DISPATCH_APP_CLIENT_ID", "SKILLS_DISPATCH_APP_PRIVATE_KEY"];
const SAMPLE_SHA = "0123456789abcdef0123456789abcdef01234567";

function tokenStepIndex() {
  return STEPS.findIndex((step) => String(step.uses ?? "").startsWith(APP_TOKEN_ACTION));
}

function runSteps() {
  return STEPS.filter((step) => typeof step.run === "string");
}

function evaluatePayload(run, sourceRef) {
  const filter = /^jq -n --arg source_ref "\$SOURCE_REF" '([^']+)'/.exec(run)?.[1];
  expect(filter).toBeDefined();
  const result = spawnSync("jq", ["-n", "-c", "--arg", "source_ref", sourceRef, filter], {
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe("release.yml: dispatch-skills-parity", () => {
  it("runs only once the publish job has succeeded", () => {
    expect(JOB).toBeDefined();
    expect([JOB.needs].flat()).toEqual(["publish"]);
    expect(JOB.if).toBe(RELEASE.jobs.publish.if);
  });

  it("grants the workflow token nothing, since the dispatch authenticates as the app", () => {
    expect(JOB.permissions).toEqual({});
  });

  it("lets no step be skipped or have its failure swallowed", () => {
    expect(JOB["continue-on-error"]).toBeUndefined();
    for (const step of STEPS) {
      expect(step["continue-on-error"]).toBeUndefined();
      expect(step.if).toBeUndefined();
    }
  });

  it("fails on a missing dispatch secret before minting a token", () => {
    const check = STEPS[0];

    expect(tokenStepIndex()).toBeGreaterThan(0);
    expect(Object.keys(check.env).sort()).toEqual(REQUIRED_SECRETS);
    for (const name of REQUIRED_SECRETS) {
      expect(check.env[name]).toBe(`\${{ secrets.${name} }}`);
      expect(check.run).toContain(`[ -n "$${name}" ]`);
    }
    expect(check.run).toContain("::error");
    expect(check.run).toContain("exit 1");
  });

  it("mints an app token pinned to a full commit SHA and scoped to actions on verbatra/skills", () => {
    const token = STEPS[tokenStepIndex()];

    expect(token?.uses).toMatch(/^actions\/create-github-app-token@[0-9a-f]{40}$/);
    expect(token.with).toEqual({
      "client-id": `\${{ secrets.SKILLS_DISPATCH_APP_CLIENT_ID }}`,
      "private-key": `\${{ secrets.SKILLS_DISPATCH_APP_PRIVATE_KEY }}`,
      owner: "verbatra",
      repositories: "skills",
      "permission-actions": "write",
    });
  });

  it("dispatches the skills parity workflow on main with the released commit as source_ref", () => {
    const send = STEPS.at(-1);

    expect(STEPS.indexOf(send)).toBeGreaterThan(tokenStepIndex());
    expect(send.env).toEqual({
      GH_TOKEN: `\${{ steps.${STEPS[tokenStepIndex()].id}.outputs.token }}`,
      SOURCE_REF: `\${{ github.event.workflow_run.head_sha }}`,
    });
    expect(evaluatePayload(send.run, SAMPLE_SHA)).toEqual({
      ref: "main",
      inputs: { source_ref: SAMPLE_SHA },
    });
    expect(send.run).toContain(
      "| gh api --method POST repos/verbatra/skills/actions/workflows/parity.yml/dispatches --input -",
    );
  });

  it("keeps every expression out of run scripts", () => {
    expect(runSteps()).toHaveLength(2);
    for (const step of runSteps()) {
      expect(step.run).not.toContain("${{");
    }
  });
});
