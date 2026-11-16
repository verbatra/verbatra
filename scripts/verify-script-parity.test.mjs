import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CI_WORKFLOW = readFileSync(resolve(REPO_ROOT, ".github/workflows/ci.yml"), "utf8");
const ROOT_MANIFEST = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function jobBlock(yamlText, jobName) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === `  ${jobName}:`);
  if (start === -1) {
    throw new Error(`job "${jobName}" not found in ci.yml`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function blockScalarLines(blockLines, start) {
  const bodyIndent = indentOf(blockLines[start] ?? "");
  const body = [];
  for (let index = start; index < blockLines.length; index += 1) {
    const text = blockLines[index] ?? "";
    if (text.trim() === "") {
      continue;
    }
    if (indentOf(text) < bodyIndent) {
      break;
    }
    body.push(text.trim());
  }
  return body;
}

function runCommands(blockLines) {
  const commands = [];
  for (let index = 0; index < blockLines.length; index += 1) {
    const line = blockLines[index] ?? "";
    const inline = /^\s*run:\s*([^|\s].*)$/.exec(line);
    if (inline?.[1] !== undefined) {
      commands.push(inline[1].trim());
    } else if (/^\s*run:\s*\|/.test(line)) {
      commands.push(...blockScalarLines(blockLines, index + 1));
    }
  }
  return commands;
}

function gateChecks(commands) {
  return commands.filter(
    (command) =>
      command.startsWith("pnpm ") &&
      !command.startsWith("pnpm install") &&
      !command.includes("store path"),
  );
}

const ciGateChecks = gateChecks(runCommands(jobBlock(CI_WORKFLOW, "build-and-test")));
const verifySteps = String(ROOT_MANIFEST.scripts.verify)
  .split("&&")
  .map((step) => step.trim());

describe("the root verify script mirrors the CI build-and-test job", () => {
  it("runs exactly the same checks, in the same order", () => {
    expect(verifySteps).toEqual(ciGateChecks);
  });

  it("covers the guards that appear nowhere else in the contributor docs", () => {
    for (const guard of [
      "pnpm check:no-em-dash",
      "pnpm check:dts",
      "pnpm check:studio-bundle",
      "pnpm check:config-schema",
      "pnpm check:schemas",
      "pnpm check:lazy-provider-sdks",
      "pnpm typecheck:configs",
      "pnpm test:scripts",
    ]) {
      expect(verifySteps).toContain(guard);
    }
  });

  it("names the dash guard step after every character the script rejects", () => {
    const step = CI_WORKFLOW.split(/\r?\n/).findIndex((line) =>
      line.includes("pnpm check:no-em-dash"),
    );
    const name = CI_WORKFLOW.split(/\r?\n/)[step - 1] ?? "";
    expect(name).toContain("U+2014");
    expect(name).toContain("U+2015");
    expect(ROOT_MANIFEST.scripts["check:no-em-dash"]).toContain("\\342\\200\\225");
  });

  it("names only scripts the root manifest actually defines", () => {
    for (const step of verifySteps) {
      if (step === "pnpm turbo run typecheck") {
        continue;
      }
      expect(ROOT_MANIFEST.scripts).toHaveProperty(step.replace(/^pnpm /, ""));
    }
  });

  it("puts the build before every check that reads build output", () => {
    const buildIndex = verifySteps.indexOf("pnpm build");

    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(verifySteps.indexOf("pnpm check:dts")).toBeGreaterThan(buildIndex);
    expect(verifySteps.indexOf("pnpm check:studio-bundle")).toBeGreaterThan(buildIndex);
    expect(verifySteps.indexOf("pnpm check:config-schema")).toBeGreaterThan(buildIndex);
    expect(verifySteps.indexOf("pnpm check:schemas")).toBeGreaterThan(buildIndex);
    expect(verifySteps.indexOf("pnpm check:lazy-provider-sdks")).toBeGreaterThan(buildIndex);
  });

  it("extracts a non-trivial command list, so the assertions cannot pass vacuously", () => {
    expect(ciGateChecks.length).toBeGreaterThanOrEqual(9);
  });

  it("scopes the parse to build-and-test, excluding the other jobs' pnpm commands", () => {
    const e2eChecks = gateChecks(runCommands(jobBlock(CI_WORKFLOW, "e2e")));

    expect(e2eChecks).toContain("pnpm build");
    expect(ciGateChecks.filter((step) => step === "pnpm build")).toHaveLength(1);
  });
});
