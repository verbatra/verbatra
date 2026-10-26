import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HERO_CHECK_COMMAND, HERO_CHECK_EXIT_CODE, HERO_TRANSLATE_COMMAND } from "./hero-terminal";
import { DRY_RUN_COMMAND } from "./install-commands";

const DOCS = process.cwd();
const REPO = join(DOCS, "../..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const PUBLISHED_CLI: {
  readonly version: string;
  readonly commands: Readonly<Record<string, ReadonlyArray<string>>>;
} = JSON.parse(read(join(DOCS, "test-support/cli-0.11.1-flags.json")));

function publishedFlags(command: string): ReadonlyMap<string, boolean> {
  return new Map(
    (PUBLISHED_CLI.commands[command] ?? []).map((spec) => {
      const [flag = "", value] = spec.split(" ");
      return [flag, value !== undefined];
    }),
  );
}

function cliWords(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "");
}

describe("the CLI lines run only what the published @verbatra/cli registers", () => {
  it("uses only commands and flags of the recorded release, each value flag with its value", () => {
    expect(PUBLISHED_CLI.version).toBe("0.11.1");
    const run = read(join(REPO, "packages/cli/src/run.ts"));
    const lines = [HERO_CHECK_COMMAND, HERO_TRANSLATE_COMMAND, DRY_RUN_COMMAND];
    for (const line of lines) {
      const [runner, pkg, command = "", ...args] = cliWords(line);
      expect(`${runner} ${pkg}`).toBe("npx @verbatra/cli");
      const published = publishedFlags(command);
      expect(published.size, command).toBeGreaterThan(0);
      expect(run).toContain(`.command("${command}")`);
      args.forEach((arg, index) => {
        if (!arg.startsWith("--")) {
          expect(published.get(args[index - 1] ?? ""), `${command} ${arg}`).toBe(true);
          return;
        }
        expect(published.has(arg), `${command} ${arg}`).toBe(true);
        const takesValue = published.get(arg) === true;
        const next = args[index + 1];
        expect(next !== undefined && !next.startsWith("--"), `${command} ${arg}`).toBe(takesValue);
        expect(run).toMatch(new RegExp(`"${arg}( <[a-z]+>)?"`));
      });
    }
  });
});

describe("the hero check and translate exit codes", () => {
  it("pins the check failure exit code to the CLI", () => {
    const run = read(join(REPO, "packages/cli/src/run.ts"));
    const body = run.slice(run.indexOf("function checkExitCode("));
    const ternary = /\? (\d) : (\d);\n\}/.exec(body);
    expect(Number(ternary?.[2])).toBe(HERO_CHECK_EXIT_CODE);
  });
});
