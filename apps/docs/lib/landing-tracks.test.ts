import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HERO_CHECK_COMMAND,
  HERO_CHECK_OUTPUT,
  HERO_TERMINAL_SCRIPT,
  HERO_TERMINAL_TITLE,
  HERO_TRANSLATE_COMMAND,
  HERO_TRANSLATE_OUTPUT,
} from "./hero-terminal";
import {
  LANDING_TRACK_IDS,
  LANDING_TRACKS,
  TRACK_CHECK_EXIT_CODES,
  TRACK_MCP_ADD_COMMAND,
  TRACK_MCP_JSON,
} from "./landing-tracks";

const DOCS = process.cwd();
const REPO = join(DOCS, "../..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function fenceAfter(markdown: string, heading: string, lang: string): string {
  const from = markdown.indexOf(heading);
  if (from === -1) throw new Error(`no ${heading}`);
  const open = markdown.indexOf(`\`\`\`${lang}`, from);
  const start = markdown.indexOf("\n", open) + 1;
  return markdown.slice(start, markdown.indexOf("```", start));
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

function docsRoutes(): ReadonlySet<string> {
  const root = join(DOCS, "content/docs");
  const routes = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^[^.]+\.mdx$/.test(entry.name)) {
        const route = relative(root, path)
          .replace(/\.mdx$/, "")
          .split("/")
          .filter((part) => !part.startsWith("("))
          .join("/");
        routes.add(`/docs/${route}`.replace(/\/index$/, ""));
      }
    }
  };
  walk(root);
  return routes;
}

describe("the landing tracks", () => {
  it("offers exactly the translate, agents and CI tracks, in that order, each keyed by its id", () => {
    expect(LANDING_TRACK_IDS).toEqual(["translate", "agents", "ci"]);
    for (const id of LANDING_TRACK_IDS) expect(LANDING_TRACKS[id].id).toBe(id);
    expect(Object.keys(LANDING_TRACKS)).toEqual([...LANDING_TRACK_IDS]);
  });

  it("links every track to a docs page that exists", () => {
    const routes = docsRoutes();
    for (const id of LANDING_TRACK_IDS) {
      expect(routes.has(LANDING_TRACKS[id].docsPath), LANDING_TRACKS[id].docsPath).toBe(true);
    }
  });

  it("gives every track at least one command line, each a single line with no trailing newline", () => {
    for (const id of LANDING_TRACK_IDS) {
      const commands = LANDING_TRACKS[id].steps.map((step) => step.command);
      expect(commands.length, id).toBeGreaterThan(0);
      for (const line of commands) expect(line, id).toMatch(/^\S[^\n]*\S$/);
    }
  });

  it("carries a file only on a track with no recorded transcript, which shows it in its place, and runs every track in the shell frame the rest of the landing titles", () => {
    for (const id of LANDING_TRACK_IDS) {
      const track = LANDING_TRACKS[id];
      expect(track.terminalTitle, id).toBe(HERO_TERMINAL_TITLE);
      if (track.steps.some((step) => step.output.length > 0)) expect(track.files, id).toEqual([]);
      for (const file of track.files) expect(file.filename, id).toBeTruthy();
    }
  });

  it("dates nothing itself: no literal version and no release badge in the source", () => {
    const source = read(join(DOCS, "lib/landing-tracks.ts"));
    expect(source).not.toMatch(/\d+\.\d+\.\d+/);
    expect(source).not.toMatch(/AvailableFrom/);
  });
});

describe("the translate track equals its sources", () => {
  it("runs the recorded check and translate commands, each followed by the transcript it printed", () => {
    expect(LANDING_TRACKS.translate.steps).toEqual([
      { command: HERO_CHECK_COMMAND, output: HERO_CHECK_OUTPUT },
      { command: HERO_TRANSLATE_COMMAND, output: HERO_TRANSLATE_OUTPUT },
    ]);
    expect(LANDING_TRACKS.translate.steps).toEqual(
      HERO_TERMINAL_SCRIPT.map(({ command, output }) => ({ command, output })),
    );
    expect(HERO_TERMINAL_SCRIPT.at(-1)?.exitCode).toBe(LANDING_TRACKS.translate.exitCode);
    expect(LANDING_TRACKS.translate.exitCode).toBe(TRACK_CHECK_EXIT_CODES.ok);
  });
});

describe("the CLI lines run only what the published @verbatra/cli registers", () => {
  it("uses only commands and flags of the recorded release, each value flag with its value", () => {
    expect(PUBLISHED_CLI.version).toBe("0.11.1");
    const run = read(join(REPO, "packages/cli/src/run.ts"));
    const lines = LANDING_TRACK_IDS.flatMap((id) =>
      LANDING_TRACKS[id].steps.map((step) => step.command),
    ).filter((line) => line.startsWith("npx @verbatra/cli "));
    expect(lines).toEqual([HERO_CHECK_COMMAND, HERO_TRANSLATE_COMMAND, HERO_CHECK_COMMAND]);
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

describe("the CI track equals its sources", () => {
  it("pins the check exit codes to the CLI", () => {
    const run = read(join(REPO, "packages/cli/src/run.ts"));
    const body = run.slice(run.indexOf("function checkExitCode("));
    const ternary = /\? (\d) : (\d);\n\}/.exec(body);
    expect(ternary?.slice(1).map(Number)).toEqual([
      TRACK_CHECK_EXIT_CODES.ok,
      TRACK_CHECK_EXIT_CODES.fail,
    ]);
    const exit2 = run.slice(run.indexOf("function renderFailureExit2("));
    expect(exit2.slice(0, exit2.indexOf("\n}"))).toContain(
      `return ${TRACK_CHECK_EXIT_CODES.usage};`,
    );
    expect(HERO_CHECK_COMMAND).toBe("npx @verbatra/cli check");
  });

  it("prints the recorded check transcript and exits as a failing gate", () => {
    expect(LANDING_TRACKS.ci.steps).toEqual([
      { command: HERO_CHECK_COMMAND, output: HERO_CHECK_OUTPUT },
    ]);
    expect(LANDING_TRACKS.ci.exitCode).toBe(TRACK_CHECK_EXIT_CODES.fail);
  });
});

describe("the agents track equals its sources", () => {
  const guide = () => read(join(DOCS, "content/docs/(agents)/connect-an-mcp-client.mdx"));

  it("copies the Claude Code .mcp.json block from the MCP client guide", () => {
    expect(TRACK_MCP_JSON).toBe(fenceAfter(guide(), "## Claude Code", "json"));
    expect(LANDING_TRACKS.agents.files).toEqual([
      { language: "json", filename: ".mcp.json", code: TRACK_MCP_JSON },
    ]);
  });

  it("copies the claude mcp add line from the MCP client guide", () => {
    expect(`${TRACK_MCP_ADD_COMMAND}\n`).toBe(fenceAfter(guide(), "#### Without the CLI", "bash"));
    expect(LANDING_TRACKS.agents.steps.map((step) => step.command)).toEqual([
      TRACK_MCP_ADD_COMMAND,
    ]);
  });

  it("claims no recorded output, since no transcript of the MCP client is pinned", () => {
    expect(LANDING_TRACKS.agents.steps.flatMap((step) => step.output)).toEqual([]);
    expect(LANDING_TRACKS.agents.exitCode).toBeNull();
  });
});
