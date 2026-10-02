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

const DECLARATION =
  /^(?:export )?(?:(?:async )?function (\w+)\(|const (\w+)(?:: [^\n]*?)? = (?:async )?\()/gm;

function topLevelFunctions(sources) {
  const functions = new Map();
  for (const source of sources) {
    const starts = [...source.matchAll(DECLARATION)];
    starts.forEach((match, index) => {
      const end = starts[index + 1]?.index ?? source.length;
      functions.set(match[1] ?? match[2], { source, start: match.index, end });
    });
  }
  return functions;
}

function bodyOf({ source, start, end }) {
  return source.slice(start, end);
}

function calledNames(body, functions) {
  return [...functions.keys()].filter((name) => new RegExp(`(?<![.\\w])${name}\\(`).test(body));
}

function closure(body, functions) {
  const reached = new Set();
  const pending = calledNames(body, functions);
  while (pending.length > 0) {
    const name = pending.pop();
    if (!reached.has(name)) {
      reached.add(name);
      pending.push(...calledNames(bodyOf(functions.get(name)), functions));
    }
  }
  return reached;
}

function commandRegistrations(source) {
  return [...source.matchAll(/\.command\("([a-z]+)"\)/g)].map((match) => ({
    name: match[1],
    index: match.index,
    body: source.slice(match.index, source.indexOf("\n}\n", match.index)),
  }));
}

function unattributedReferences(callee, sources, functions) {
  const problems = [];
  for (const source of sources) {
    for (const match of source.matchAll(new RegExp(`\\b${callee}\\b`, "g"))) {
      const line = source.slice(
        source.lastIndexOf("\n", match.index) + 1,
        source.indexOf("\n", match.index),
      );
      if (/^import\b|^\s*\}? ?from\b|^\s*\w+,?$/.test(line.trim()) && !line.includes("(")) {
        continue;
      }
      const inFunction = [...functions.values()].some(
        (span) => span.source === source && span.start <= match.index && match.index < span.end,
      );
      if (!inFunction || source[match.index + callee.length] !== "(") {
        problems.push(line.trim());
      }
    }
  }
  return problems;
}

function commandsCalling(callee, sources = CLI_SOURCES.map(cliSource)) {
  const functions = topLevelFunctions(sources);
  const unattributed = unattributedReferences(callee, sources, functions);
  if (unattributed.length > 0) {
    throw new Error(
      `${callee} is referenced in a way no command can be traced through: ${unattributed.join(" | ")}`,
    );
  }
  const direct = [...functions]
    .filter(([, span]) => bodyOf(span).includes(`${callee}(`))
    .map(([name]) => name);
  const registrations = commandRegistrations(sources[0]).map(({ name, index, body }) => ({
    index,
    name,
    reached: closure(body, functions),
    direct: body.includes(`${callee}(`),
  }));
  const reachedByAnyCommand = new Set(registrations.flatMap(({ reached }) => [...reached]));
  const registeredIn = (span) =>
    registrations.some(
      ({ index, direct: calls }) =>
        calls && span.source === sources[0] && span.start <= index && index < span.end,
    );
  const orphaned = direct.filter(
    (name) => !reachedByAnyCommand.has(name) && !registeredIn(functions.get(name)),
  );
  if (orphaned.length > 0) {
    throw new Error(`${callee} is called from ${orphaned.join(", ")}, which no command reaches`);
  }
  return registrations
    .filter(({ reached, direct: calls }) => calls || direct.some((name) => reached.has(name)))
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
  return environmentFilesListsOf(readDocPage("cli/index", suffix), suffix, commands);
}

function environmentFilesListsOf(page, suffix, commands) {
  const sentences = section(page, ENVIRONMENT_FILES_HEADING[suffix])
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => ({ sentence, names: commandSpans(sentence, commands) }))
    .filter(({ names }) => names.length > 0);
  const loading = sentences.filter(({ sentence }) => sentence.includes("`.env.local`"));
  const notLoading = sentences.filter(({ sentence }) => !sentence.includes("`.env.local`"));
  if (loading.length !== 1 || notLoading.length !== 1) {
    throw new Error(
      `cli/index${suffix}.mdx: expected one sentence naming the commands that load \`.env.local\` and one naming the rest, found ${loading.length} and ${notLoading.length}`,
    );
  }
  return { loading: loading[0].names, notLoading: notLoading[0].names };
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

  it("follows a call through an arrow-const helper", () => {
    const [run, ...rest] = CLI_SOURCES.map(cliSource);
    const patched = `${run.replace(
      /(\.command\("check"\)[\s\S]*?\.action\(async \(opts: unknown\) => \{)/,
      "$1\n      loadForCheck(process.cwd());",
    )}\nconst loadForCheck = (cwd: string): void => {\n  loadEnvFiles(cwd);\n};\n`;

    expect(commandsCalling("loadEnvFiles", [patched, ...rest])).toContain("check");
  });

  it("follows a call through a typed arrow-const helper", () => {
    const [run, ...rest] = CLI_SOURCES.map(cliSource);
    const patched = `${run.replace(
      /(\.command\("check"\)[\s\S]*?\.action\(async \(opts: unknown\) => \{)/,
      "$1\n      loadForCheck(process.cwd());",
    )}\nconst loadForCheck: (cwd: string) => void = (cwd) => {\n  loadEnvFiles(cwd);\n};\n`;

    expect(commandsCalling("loadEnvFiles", [patched, ...rest])).toContain("check");
  });

  it("fails loudly on a reference it cannot trace to a command", () => {
    const [run, ...rest] = CLI_SOURCES.map(cliSource);
    const aliased = `${run}\nexport const envLoader = { load: loadEnvFiles };\n`;
    const orphaned = `${run}\nfunction unusedLoader(cwd: string): void {\n  loadEnvFiles(cwd);\n}\n`;

    expect(() => commandsCalling("loadEnvFiles", [aliased, ...rest])).toThrow(/traced/);
    expect(() => commandsCalling("loadEnvFiles", [orphaned, ...rest])).toThrow(
      /no command reaches/,
    );
  });

  it("ignores a harmless extra sentence and rejects a second command list", () => {
    const page = readDocPage("cli/index", "");
    const heading = ENVIRONMENT_FILES_HEADING[""];
    const extra = page.replace(`${heading}\n\n`, `${heading}\n\nThese files are optional. `);

    expect(environmentFilesListsOf(extra, "", commands).loading).toEqual(loading);
    expect(() =>
      environmentFilesListsOf(
        page.replace(`${heading}\n\n`, `${heading}\n\n\`check\` is fast. `),
        "",
        commands,
      ),
    ).toThrow(/expected one sentence/);
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

function docPages() {
  const contentDir = resolve(REPO_ROOT, "apps/docs/content/docs");
  return readdirSync(contentDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => readFileSync(resolve(contentDir, file), "utf8"));
}

function sessionVariablesIn(pages) {
  return [...new Set(pages.flatMap((page) => page.match(SESSION_VARIABLE) ?? []))].sort();
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
    expect(sessionVariablesIn(docPages())).toEqual([...studio, mcp].sort());
  });

  it("sees a dropped value and a renamed variable", () => {
    const text = subsection(readDocPage("cli/mcp", ""), SPEND_SECTION_HEADING.mcp[""]);

    expect(acceptedValues(text.replace("`yes` or ", ""))).not.toEqual(truthy);
    const renamed = [...docPages(), "Set `VERBATRA_MCP_SPEND=1` first."];

    expect(sessionVariablesIn(renamed)).not.toEqual([...studio, mcp].sort());
    expect(sessionVariablesIn(renamed)).toContain("VERBATRA_MCP_SPEND");
  });
});
