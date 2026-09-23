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

function stepUsing(prefix) {
  return STEPS.find((step) => String(step.uses ?? "").startsWith(prefix));
}

function runSteps() {
  return STEPS.filter((step) => typeof step.run === "string");
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

  it("fails before minting a token when a dispatch secret is missing", () => {
    const [check] = STEPS;

    expect(Object.keys(check.env).sort()).toEqual(REQUIRED_SECRETS);
    for (const name of REQUIRED_SECRETS) {
      expect(check.env[name]).toBe(`\${{ secrets.${name} }}`);
      expect(check.run).toContain(`[ -n "$${name}" ]`);
    }
    expect(check.run).toContain("::error");
    expect(check.run).toContain("exit 1");
  });

  it("mints an app token pinned to a full commit SHA and scoped to verbatra/skills contents", () => {
    const token = stepUsing(APP_TOKEN_ACTION);

    expect(token?.uses).toMatch(/^actions\/create-github-app-token@[0-9a-f]{40}$/);
    expect(token.with).toEqual({
      "client-id": `\${{ secrets.SKILLS_DISPATCH_APP_CLIENT_ID }}`,
      "private-key": `\${{ secrets.SKILLS_DISPATCH_APP_PRIVATE_KEY }}`,
      owner: "verbatra",
      repositories: "skills",
      "permission-contents": "write",
    });
  });

  it("sends the event type and payload key the skills parity workflow listens for", () => {
    const send = STEPS.at(-1);

    expect(send.env).toEqual({
      GH_TOKEN: `\${{ steps.${stepUsing(APP_TOKEN_ACTION).id}.outputs.token }}`,
      SOURCE_REF: `\${{ github.event.workflow_run.head_sha }}`,
    });
    expect(send.run).toContain('event_type: "source-changed"');
    expect(send.run).toContain("client_payload: {source_ref: $source_ref}");
    expect(send.run).toContain('--arg source_ref "$SOURCE_REF"');
    expect(send.run).toContain("repos/verbatra/skills/dispatches");
  });

  it("keeps every expression out of run scripts", () => {
    expect(runSteps()).toHaveLength(2);
    for (const step of runSteps()) {
      expect(step.run).not.toContain("${{");
    }
  });
});
