import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

const CLI_SOURCES = ["run.ts", "studio-command.ts", "mcp-command.ts"];

const ENVIRONMENT_FILES_HEADING = {
  "": "## Environment files",
  ".de": "## Umgebungsdateien",
  ".es": "## Archivos de entorno",
  ".fr": "## Fichiers d'environnement",
};

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function readDocPage(prefix, suffix) {
  return readRepoFile(`apps/docs/content/docs/${prefix}${suffix}.mdx`);
}

function cliSource(file) {
  return readRepoFile(`packages/cli/src/${file}`);
}

function topLevelFunctions(sources) {
  const functions = new Map();
  for (const source of sources) {
    const starts = [...source.matchAll(/^(?:export )?(?:async )?function (\w+)\(/gm)];
    starts.forEach((match, index) => {
      functions.set(match[1], source.slice(match.index, starts[index + 1]?.index ?? source.length));
    });
  }
  return functions;
}

function callsAny(body, names) {
  return [...names].some((name) => new RegExp(`(?<![.\\w])${name}\\(`).test(body));
}

function functionsReaching(callee, functions) {
  const reaching = new Set(
    [...functions].filter(([, body]) => body.includes(`${callee}(`)).map(([name]) => name),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, body] of functions) {
      if (!reaching.has(name) && callsAny(body, reaching)) {
        reaching.add(name);
        grew = true;
      }
    }
  }
  return reaching;
}

function commandRegistrations(source) {
  return [...source.matchAll(/\.command\("([a-z]+)"\)/g)].map((match) => ({
    name: match[1],
    body: source.slice(match.index, source.indexOf("\n}\n", match.index)),
  }));
}

function commandsCalling(callee, sources = CLI_SOURCES.map(cliSource)) {
  const reaching = functionsReaching(callee, topLevelFunctions(sources));
  return commandRegistrations(sources[0])
    .filter(({ body }) => callsAny(body, new Set([callee, ...reaching])))
    .map(({ name }) => name)
    .sort();
}

function section(page, heading) {
  const start = page.indexOf(`${heading}\n`);
  if (start === -1) {
    throw new Error(`"${heading}" could not be located`);
  }
  const end = page.indexOf("\n## ", start + heading.length);
  return page.slice(start + heading.length, end === -1 ? page.length : end).trim();
}

function commandSpans(text, commands) {
  return [...text.matchAll(/`([a-z]+)`/g)]
    .map((match) => match[1])
    .filter((name) => commands.includes(name))
    .sort();
}

function environmentFilesLists(suffix, commands) {
  const sentences = section(readDocPage("cli/index", suffix), ENVIRONMENT_FILES_HEADING[suffix])
    .split(/(?<=[.!?])\s+(?=[`A-Z])/)
    .filter((sentence) => sentence.length > 0);
  return {
    loading: commandSpans(sentences[0] ?? "", commands),
    notLoading: commandSpans(sentences.at(-1) ?? "", commands),
  };
}

describe("the environment files section names exactly the commands that load .env files", () => {
  const commands = commandRegistrations(cliSource("run.ts"))
    .map(({ name }) => name)
    .sort();
  const loading = commandsCalling("loadEnvFiles");

  it("finds the loadEnvFiles call sites, so the comparison cannot pass vacuously", () => {
    expect(commands.length).toBeGreaterThanOrEqual(10);
    expect(loading).toEqual(expect.arrayContaining(["translate", "studio", "mcp"]));
    expect(loading).not.toContain("check");
  });

  it.each(LOCALE_SUFFIXES)("in cli/index%s.mdx", (suffix) => {
    const lists = environmentFilesLists(suffix, commands);

    expect(lists.loading).toEqual(loading);
    expect(lists.notLoading).toEqual(commands.filter((name) => !loading.includes(name)));
  });

  it("sees a command that starts loading .env files without the page saying so", () => {
    const [run, ...rest] = CLI_SOURCES.map(cliSource);
    const patched = run.replace(
      /(\.command\("check"\)[\s\S]*?\.action\(async \(opts: unknown\) => \{)/,
      "$1\n      loadEnvFiles(process.cwd());",
    );

    expect(patched).not.toBe(run);
    expect(commandsCalling("loadEnvFiles", [patched, ...rest])).toContain("check");
  });
});

const SPEND_SECTION_HEADING = {
  studio: {
    "": "### Spend and agent tools",
    ".de": "### Ausgaben und Agent-Tools",
    ".es": "### Gasto y herramientas de agente",
    ".fr": "### Dépenses et outils d'agent",
  },
  mcp: {
    "": "### Spend tools",
    ".de": "### Kostenpflichtige Tools",
    ".es": "### Herramientas de gasto",
    ".fr": "### Outils payants",
  },
};

const SESSION_VARIABLE = /\bVERBATRA_(?:STUDIO|MCP)_[A-Z_]+\b/g;

function stringConstant(relativePath, name) {
  const value = new RegExp(`const ${name} = "([^"]+)";`).exec(readRepoFile(relativePath))?.[1];
  if (value === undefined) {
    throw new Error(`${name} could not be located in ${relativePath}`);
  }
  return value;
}

function truthyValues(relativePath) {
  const list = /const TRUTHY_ENV_VALUES = new Set\(\[([^\]]*)\]\)/.exec(
    readRepoFile(relativePath),
  )?.[1];
  if (list === undefined) {
    throw new Error(`TRUTHY_ENV_VALUES could not be located in ${relativePath}`);
  }
  return [...list.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

function subsection(page, heading) {
  const start = page.indexOf(`${heading}\n`);
  if (start === -1) {
    throw new Error(`"${heading}" could not be located`);
  }
  const end = page.slice(start + heading.length).search(/\n#{2,3} /);
  return end === -1 ? page.slice(start) : page.slice(start, start + heading.length + end);
}

function acceptedValues(text) {
  const sentence = text.split(/(?<=[.;])\s/).find((part) => part.includes("`true`")) ?? "";
  return [...sentence.matchAll(/`([a-z0-9]+)`/g)].map((match) => match[1]);
}

function sessionVariablesInDocs() {
  const contentDir = resolve(REPO_ROOT, "apps/docs/content/docs");
  const names = readdirSync(contentDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .flatMap(
      (file) => readFileSync(resolve(contentDir, file), "utf8").match(SESSION_VARIABLE) ?? [],
    );
  return [...new Set(names)].sort();
}

describe("the spend switches are documented with the names and values the source reads", () => {
  const truthy = truthyValues("packages/cli/src/session-command-support.ts");
  const studio = [
    stringConstant("packages/cli/src/studio-command.ts", "ALLOW_SPEND_ENV_VAR"),
    stringConstant("packages/cli/src/studio-command.ts", "AGENT_TOOLS_ENV_VAR"),
  ];
  const mcp = stringConstant("packages/cli/src/mcp-command.ts", "ALLOW_SPEND_ENV_VAR");

  it("reads the same names and values from the CLI and the verbatra-mcp binary", () => {
    expect(truthy).toEqual(expect.arrayContaining(["1", "true"]));
    expect(truthyValues("packages/mcp/src/bin-args.ts")).toEqual(truthy);
    expect(stringConstant("packages/mcp/src/bin-args.ts", "ALLOW_SPEND_ENV_VAR")).toBe(mcp);
  });

  it.each(LOCALE_SUFFIXES)(
    "states both Studio variables and every accepted value in cli/studio%s.mdx",
    (suffix) => {
      const text = subsection(
        readDocPage("cli/studio", suffix),
        SPEND_SECTION_HEADING.studio[suffix],
      );

      for (const name of studio) {
        expect(text).toContain(`\`${name}\``);
      }
      expect(acceptedValues(text)).toEqual(truthy);
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "states the MCP variable and every accepted value in cli/mcp%s.mdx",
    (suffix) => {
      const text = subsection(readDocPage("cli/mcp", suffix), SPEND_SECTION_HEADING.mcp[suffix]);

      expect(text).toContain(`\`${mcp}\``);
      expect(acceptedValues(text)).toEqual(truthy);
    },
  );

  it("names no Studio or MCP variable the source does not read, on any page", () => {
    expect(sessionVariablesInDocs()).toEqual([...studio, mcp].sort());
  });

  it("sees a dropped value and a renamed variable", () => {
    const text = subsection(readDocPage("cli/mcp", ""), SPEND_SECTION_HEADING.mcp[""]);

    expect(acceptedValues(text.replace("`yes` or ", ""))).not.toEqual(truthy);
    expect("VERBATRA_MCP_SPEND=1".match(SESSION_VARIABLE)).toEqual(["VERBATRA_MCP_SPEND"]);
  });
});
