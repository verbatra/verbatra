import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_CLIENT_CONFIGS, AGENT_CLIENT_IDS, type AgentClientId } from "./agent-clients.js";
import { type InitDeps, runInit } from "./init.js";
import { captureStreams, parseEnvelope } from "./test-support.js";

const nonInteractive: InitDeps = { isTty: () => false };
const canDropReadAccess = process.getuid?.() !== 0 && process.platform !== "win32";
const CONFIG = "export default { hand: 'edited' };\n";

interface ClientJson {
  readonly id: string;
  readonly file: string;
  readonly server: string;
  readonly reason: string | null;
  readonly selectedBy: string;
  readonly markers: readonly string[];
}

interface InitResult {
  readonly files: readonly { readonly path: string; readonly action: string }[];
  readonly dryRun: boolean;
  readonly agent: {
    readonly instructionsFile: string;
    readonly mcpServer: string | null;
    readonly configKept: boolean;
    readonly clients: readonly ClientJson[];
  };
  readonly nextSteps: readonly { readonly description: string; readonly command: string | null }[];
}

function snapshot(root: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        entries[path] = `-> ${readlinkSync(path)}`;
      } else if (stat.isDirectory()) {
        entries[path] = "<dir>";
        walk(path);
      } else {
        entries[path] = readFileSync(path, "utf8");
      }
    }
  };
  walk(root);
  return entries;
}

function render(id: AgentClientId, indent: string, eol: string): string {
  return JSON.stringify(AGENT_CLIENT_CONFIGS[id].server, null, indent)
    .split("\n")
    .join(`${eol}${indent}${indent}`);
}

let root: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "verbatra-init-clients-"));
  dir = join(root, "project");
  mkdirSync(dir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function put(name: string, content: string): void {
  mkdirSync(dirname(join(dir, name)), { recursive: true });
  writeFileSync(join(dir, name), content);
}

const read = (name: string) => readFileSync(join(dir, name), "utf8");

async function init(opts: Record<string, unknown>) {
  const cap = captureStreams();
  const code = await runInit({ cwd: dir, agent: true, ...opts }, cap.streams, nonInteractive);
  return { code, cap };
}

async function initJson(opts: Record<string, unknown> = {}): Promise<InitResult> {
  const { code, cap } = await init({ json: true, ...opts });
  const envelope = parseEnvelope(cap.out());
  if (code !== 0 || !envelope.ok) {
    throw new Error(`init failed: ${envelope.code}: ${envelope.message}`);
  }
  return envelope.result as InitResult;
}

async function expectRefusal(opts: Record<string, unknown>, code: string, fragment: string) {
  const before = snapshot(root);
  const run = await init({ json: true, ...opts });
  expect(run.code).toBe(2);
  const envelope = parseEnvelope(run.cap.out());
  expect(envelope).toMatchObject({ ok: false, code });
  expect(envelope.message).toContain(fragment);
  expect(snapshot(root)).toEqual(before);
  return envelope;
}

describe("init --agent per client: the fixture matrix", () => {
  beforeEach(() => {
    put("verbatra.config.ts", CONFIG);
  });

  describe.each(AGENT_CLIENT_IDS)("%s", (id) => {
    const client = AGENT_CLIENT_CONFIGS[id];
    const key = client.serversKey;
    const fresh = `${JSON.stringify({ [key]: { verbatra: client.server } }, null, 2)}\n`;

    it("creates an absent file holding exactly the documented entry", async () => {
      const result = await initJson({ client: id });
      expect(read(client.file)).toBe(fresh);
      expect(result.agent.clients).toEqual([
        { id, file: client.file, server: "added", reason: null, selectedBy: "flag", markers: [] },
      ]);
      expect(result.files).toContainEqual({ path: client.file, action: "created" });
      expect(read(client.file)).not.toMatch(/allow-spend|"env"|"inputs"/);
    });

    it("fills an empty file", async () => {
      put(client.file, "\n");
      const result = await initJson({ client: id });
      expect(read(client.file)).toBe(fresh);
      expect(result.files).toContainEqual({ path: client.file, action: "updated" });
    });

    it("keeps another server and every other key byte for byte", async () => {
      const other = [
        "{",
        '  "inputs": [{ "id": "kept", "password": true }],',
        `  "${key}": {`,
        '    "other": {',
        '      "command": "node",',
        '      "args": ["server.js", "--name=\\"quoted\\" {x}"],',
        '      "port": 8080,',
        '      "debug": false,',
        '      "token": null',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n");
      put(client.file, other);
      const result = await initJson({ client: id });
      const head = other.slice(0, other.indexOf("\n    }\n  }\n}\n") + 6);
      expect(read(client.file)).toBe(
        `${head},\n    "verbatra": ${render(id, "  ", "\n")}\n  }\n}\n`,
      );
      expect(result.agent.clients[0]?.server).toBe("added");
    });

    it("adds the servers key to an object that has none, after its other keys", async () => {
      put(client.file, '{\n  "x": 1\n}');
      await initJson({ client: id });
      expect(read(client.file)).toBe(
        `{\n  "x": 1,\n  "${key}": {\n    "verbatra": ${render(id, "  ", "\n")}\n  }\n}`,
      );
    });

    it("reports a present entry and leaves the file byte-identical", async () => {
      const present = `{ "${key}": { "verbatra": ${JSON.stringify(client.server)} } }`;
      put(client.file, present);
      const result = await initJson({ client: id });
      expect(read(client.file)).toBe(present);
      expect(result.agent.clients[0]?.server).toBe("present");
      expect(result.files).toContainEqual({ path: client.file, action: "unchanged" });
    });

    it("leaves a differing entry untouched and names the file in the next steps", async () => {
      const differs = `${JSON.stringify(
        { [key]: { verbatra: { command: "npx", args: ["-y", "@verbatra/mcp", "--allow-spend"] } } },
        null,
        2,
      )}\n`;
      put(client.file, differs);
      const result = await initJson({ client: id });
      expect(read(client.file)).toBe(differs);
      expect(result.agent.clients[0]?.server).toBe("differs");
      expect(result.nextSteps[0]?.description).toContain(`${client.file} already names`);
      expect(result.nextSteps[0]?.description).toContain(`connect-an-mcp-client#`);
    });

    it.each([
      ["invalid JSON", "{ not json", "is not plain JSON"],
      [
        "JSONC",
        `{\n  // a comment\n  "${key}": {},\n}\n`,
        "is not plain JSON (init never rewrites a file with comments or trailing commas)",
      ],
      ["a non-object document", "[]", "does not hold a JSON object"],
      ["a wrong servers type", `{ "${key}": ["verbatra"] }`, `has a value under ${key}`],
    ])("refuses %s with zero writes in the whole run", async (_label, content, fragment) => {
      rmSync(join(dir, "verbatra.config.ts"));
      put(client.file, content);
      await expectRefusal(
        { client: "all", provider: "gemini", yes: true },
        "AGENT_FILE_INVALID",
        `${client.file} ${fragment}`,
      );
      expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(false);
    });

    it("keeps CRLF line endings and tab indentation", async () => {
      const crlf = `{\r\n\t"${key}": {\r\n\t\t"other": {\r\n\t\t\t"command": "x"\r\n\t\t}\r\n\t}\r\n}\r\n`;
      put(client.file, crlf);
      await initJson({ client: id });
      expect(read(client.file)).toBe(
        `{\r\n\t"${key}": {\r\n\t\t"other": {\r\n\t\t\t"command": "x"\r\n\t\t},\r\n\t\t"verbatra": ${render(id, "\t", "\r\n")}\r\n\t}\r\n}\r\n`,
      );
    });

    it.each([
      [
        "a repeated top-level key",
        `{\n  "${key}": {},\n  "${key}": {}\n}\n`,
        "repeats a key at its top level",
      ],
      [
        "a repeated server name",
        `{\n  "${key}": {\n    "verbatra": {},\n    "verbatra": ${JSON.stringify(client.server)}\n  }\n}\n`,
        `repeats a server name under ${key}`,
      ],
    ])("refuses %s with zero writes in the whole run", async (_label, content, fragment) => {
      rmSync(join(dir, "verbatra.config.ts"));
      put(client.file, content);
      await expectRefusal(
        { client: "all", provider: "gemini", yes: true },
        "AGENT_FILE_INVALID",
        `${client.file} ${fragment}`,
      );
    });

    it("rewrites a one-line file it cannot splice, keeping its servers", async () => {
      put(client.file, `{"${key}":{"other":{"command":"x"}}}`);
      await initJson({ client: id });
      expect(JSON.parse(read(client.file))).toEqual({
        [key]: { other: { command: "x" }, verbatra: client.server },
      });
    });
  });
});

describe("init --agent: which clients it wires", () => {
  beforeEach(() => {
    put("verbatra.config.ts", CONFIG);
  });

  const wired = async (opts: Record<string, unknown> = {}) =>
    (await initJson(opts)).agent.clients.map((client) => [client.id, client.selectedBy]);

  it("wires only Claude Code when no client marker exists, even beside AGENTS.md", async () => {
    put("AGENTS.md", "# rules\n");
    const result = await initJson();
    expect(result.agent.clients).toEqual([
      {
        id: "claude",
        file: ".mcp.json",
        server: "added",
        reason: null,
        selectedBy: "default",
        markers: [],
      },
    ]);
    expect(result.agent.mcpServer).toBe("added");
    expect(existsSync(join(dir, ".cursor"))).toBe(false);
  });

  it.each([
    ["CLAUDE.md", "claude"],
    [".claude/settings.json", "claude"],
    [".mcp.json", "claude"],
    [".cursor/rules.mdc", "cursor"],
    [".cursorrules", "cursor"],
    [".vscode/mcp.json", "vscode"],
  ])("detects %s as a %s marker", async (marker, id) => {
    put(marker, marker.endsWith(".json") ? "{}\n" : "x\n");
    expect(await wired()).toEqual([[id, "markers"]]);
  });

  it("names every marker it found and wires each detected client", async () => {
    put("CLAUDE.md", "x\n");
    put(".mcp.json", "{}\n");
    put(".cursorrules", "x\n");
    const result = await initJson();
    expect(result.agent.clients.map((client) => [client.id, client.markers])).toEqual([
      ["claude", ["CLAUDE.md", ".mcp.json"]],
      ["cursor", [".cursorrules"]],
    ]);
  });

  it("reports mcpServer as null when Claude Code is not wired", async () => {
    put(".cursorrules", "x\n");
    const result = await initJson();
    expect(result.agent.mcpServer).toBeNull();
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
  });

  it("hints at a .vscode folder without mcp.json instead of wiring it", async () => {
    mkdirSync(join(dir, ".vscode"));
    const result = await initJson();
    expect(existsSync(join(dir, ".vscode/mcp.json"))).toBe(false);
    expect(result.agent.clients.map((client) => client.id)).toEqual(["claude"]);
    expect(result.nextSteps).toContainEqual({
      description: expect.stringContaining("no .vscode/mcp.json"),
      command: `npx verbatra init --agent --client vscode --cwd ${dir}`,
    });
  });

  it("lets --client replace detection", async () => {
    put(".cursorrules", "x\n");
    put("CLAUDE.md", "x\n");
    expect(await wired({ client: "vscode" })).toEqual([["vscode", "flag"]]);
    expect(existsSync(join(dir, ".cursor/mcp.json"))).toBe(false);
  });

  it("wires every client for --client all, in a fixed order, ignoring duplicates", async () => {
    expect(await wired({ client: "vscode, all,cursor" })).toEqual([
      ["claude", "flag"],
      ["cursor", "flag"],
      ["vscode", "flag"],
    ]);
    expect(await wired({ client: "vscode,claude,vscode" })).toEqual([
      ["claude", "flag"],
      ["vscode", "flag"],
    ]);
  });

  it.each([
    [{ client: "zed" }, '--client names "zed"'],
    [{ client: " , " }, "--client was given no client"],
    [{ client: "cursor", agent: false }, "needs --agent"],
  ])("refuses %j with INVALID_OPTION and its candidates", async (opts, fragment) => {
    const envelope = await expectRefusal(opts, "INVALID_OPTION", fragment);
    expect((envelope as { candidates?: unknown }).candidates).toEqual([
      "claude",
      "cursor",
      "vscode",
      "all",
    ]);
  });

  it("refuses --client without --agent before reading the project", async () => {
    rmSync(join(dir, "verbatra.config.ts"));
    await expectRefusal(
      { agent: undefined, client: "all", provider: "gemini", yes: true },
      "INVALID_OPTION",
      "needs --agent",
    );
  });
});

describe("init: files linked out of the project", () => {
  it.each([".gitignore", ".env.example", "verbatra.config.ts"])(
    "refuses %s linked outside the project with INIT_UNWRITABLE, writing nothing",
    async (name) => {
      const outside = join(root, "outside-file");
      writeFileSync(outside, "kept\n");
      symlinkSync(outside, join(dir, name));
      await expectRefusal(
        { agent: undefined, provider: "gemini", yes: true },
        "INIT_UNWRITABLE",
        `${name} is a symbolic link that does not resolve inside the project`,
      );
      expect(readFileSync(outside, "utf8")).toBe("kept\n");
    },
  );

  it("refuses a dangling .gitignore link instead of creating its target", async () => {
    symlinkSync(join(root, "created-outside"), join(dir, ".gitignore"));
    await expectRefusal(
      { agent: undefined, provider: "none", yes: true },
      "INIT_UNWRITABLE",
      ".gitignore is a symbolic link",
    );
    expect(existsSync(join(root, "created-outside"))).toBe(false);
  });

  it("writes through a .gitignore linked to a file inside the project", async () => {
    put("shared/ignore", "node_modules\n");
    symlinkSync(join(dir, "shared/ignore"), join(dir, ".gitignore"));
    await initJson({ agent: undefined, provider: "none", yes: true });
    expect(read("shared/ignore")).toContain("verbatra.cache.json");
  });
});

describe("init: a symbolic link introduced after planning", () => {
  function hookedStreams(trigger: string, hook: () => void) {
    let out = "";
    let err = "";
    return {
      streams: {
        out: (text: string) => {
          out += text;
          if (text.startsWith(trigger)) {
            hook();
          }
        },
        err: (text: string) => {
          err += text;
        },
      },
      out: () => out,
      err: () => err,
    };
  }

  it("refuses to write a client file through a directory linked after planning", async () => {
    const outside = join(root, "outside");
    mkdirSync(outside);
    const cap = hookedStreams("agent clients:", () => {
      symlinkSync(outside, join(dir, ".cursor"));
    });
    const code = await runInit(
      { cwd: dir, agent: true, client: "cursor", provider: "none", yes: true },
      cap.streams,
      nonInteractive,
    );
    expect(code).toBe(2);
    expect(cap.err()).toContain("AGENT_FILE_INVALID");
    expect(cap.err()).toContain(".cursor/mcp.json sits behind the symbolic link .cursor");
    expect(cap.err()).toContain(
      "verbatra.config.ts and .gitignore and AGENTS.md were already written",
    );
    expect(readdirSync(outside)).toEqual([]);
  });

  it("refuses to write a base file linked out of the project after planning", async () => {
    const outside = join(root, "outside-ignore");
    writeFileSync(outside, "kept\n");
    const cap = hookedStreams("created verbatra.config.ts", () => {
      symlinkSync(outside, join(dir, ".gitignore"));
    });
    const code = await runInit(
      { cwd: dir, provider: "none", yes: true },
      cap.streams,
      nonInteractive,
    );
    expect(code).toBe(2);
    expect(cap.err()).toContain("INIT_UNWRITABLE");
    expect(cap.err()).toContain("verbatra.config.ts was already written");
    expect(readFileSync(outside, "utf8")).toBe("kept\n");
  });
});

describe("init --agent: a second run and a dry run", () => {
  it("leaves every file byte-identical on a second run", async () => {
    put("CLAUDE.md", "# rules\n");
    put(".vscode/mcp.json", '{\n  "servers": {}\n}\n');
    const opts = { client: "all", provider: "gemini", yes: true };
    await initJson(opts);
    const first = snapshot(root);
    const again = await initJson(opts);
    expect(snapshot(root)).toEqual(first);
    expect(again.files.every((file) => file.action === "unchanged")).toBe(true);
    expect(again.agent.clients.map((client) => client.server)).toEqual([
      "present",
      "present",
      "present",
    ]);
  });

  it("writes nothing under --dry-run and reports every planned action", async () => {
    put(".gitignore", "node_modules\n");
    put(".cursor/mcp.json", '{\n  "mcpServers": {}\n}\n');
    const before = snapshot(root);
    const result = await initJson({ client: "all", provider: "gemini", yes: true, dryRun: true });
    expect(snapshot(root)).toEqual(before);
    expect(result.dryRun).toBe(true);
    expect(result.files).toEqual([
      { path: "verbatra.config.ts", action: "created" },
      { path: ".env.example", action: "created" },
      { path: ".gitignore", action: "updated" },
      { path: "AGENTS.md", action: "created" },
      { path: ".mcp.json", action: "created" },
      { path: ".cursor/mcp.json", action: "updated" },
      { path: ".vscode/mcp.json", action: "created" },
    ]);
    expect(result.nextSteps[0]?.description).toContain("Nothing was written");
  });

  it("says what it would do in human output, and writes nothing", async () => {
    put("verbatra.config.ts", CONFIG);
    const before = snapshot(root);
    const { code, cap } = await init({ client: "cursor", dryRun: true });
    expect(code).toBe(0);
    expect(snapshot(root)).toEqual(before);
    expect(cap.out()).toContain("agent clients: Cursor (from --client)");
    expect(cap.out()).toContain("would create AGENTS.md (verbatra section for coding agents)");
    expect(cap.out()).toContain(
      "would create .cursor/mcp.json (Cursor: verbatra MCP server added, spending off)",
    );
    expect(cap.out()).toContain("Run the same command without --dry-run");
  });

  it("reports false for dryRun on a real run, beside the 0.12 fields", async () => {
    const result = await initJson({ provider: "gemini", yes: true });
    expect(Object.keys(result)).toEqual([
      "configPath",
      "files",
      "dryRun",
      "config",
      "sources",
      "apiKeyEnvVar",
      "detection",
      "agent",
      "nextSteps",
    ]);
    expect(result.dryRun).toBe(false);
    expect(Object.keys(result.agent)).toEqual([
      "instructionsFile",
      "mcpServer",
      "configKept",
      "clients",
    ]);
  });
});

describe("init --agent: human output", () => {
  beforeEach(() => {
    put("verbatra.config.ts", CONFIG);
  });

  it("prints the detected clients, one line per file, and the next steps", async () => {
    put(".cursorrules", "x\n");
    put("CLAUDE.md", "x\n");
    const { code, cap } = await init({});
    expect(code).toBe(0);
    const out = cap.out();
    expect(out).toContain(
      "agent clients: Claude Code (found CLAUDE.md), Cursor (found .cursorrules)\n",
    );
    expect(out).toContain("updated CLAUDE.md (verbatra section for coding agents)\n");
    expect(out).toContain(
      "created .mcp.json (Claude Code: verbatra MCP server added, spending off)",
    );
    expect(out).toContain(
      "created .cursor/mcp.json (Cursor: verbatra MCP server added, spending off)",
    );
    expect(cap.err()).toBe("");
  });

  it("says when no client marker was found", async () => {
    const { cap } = await init({});
    expect(cap.out()).toContain("agent clients: Claude Code (no client marker found)\n");
  });

  it("prints nothing but the envelope under --json", async () => {
    const { cap } = await init({ json: true, client: "all" });
    expect(cap.out().trim().split("\n")).toHaveLength(1);
  });
});

describe("init --agent: the Claude Code plugin guard", () => {
  beforeEach(() => {
    put("verbatra.config.ts", CONFIG);
  });

  const enabled = (value: unknown) =>
    `${JSON.stringify({ enabledPlugins: { "verbatra@verbatra": value } }, null, 2)}\n`;

  it.each([".claude/settings.json", ".claude/settings.local.json"])(
    "skips .mcp.json when %s enables the verbatra plugin",
    async (settings) => {
      put(settings, enabled(true));
      const result = await initJson({ client: "all" });
      expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
      expect(result.agent.mcpServer).toBe("skipped");
      expect(result.agent.clients[0]).toMatchObject({
        id: "claude",
        file: ".mcp.json",
        server: "skipped",
        reason: "plugin",
      });
      expect(result.files.map((file) => file.path)).not.toContain(".mcp.json");
      expect(result.nextSteps[0]?.description).toContain(`enabled in ${settings}`);
      expect(existsSync(join(dir, ".cursor/mcp.json"))).toBe(true);
    },
  );

  it("never deletes an existing verbatra entry next to the plugin", async () => {
    put(".claude/settings.json", enabled(true));
    const existing = `${JSON.stringify({ mcpServers: { verbatra: { command: "x" } } })}\n`;
    put(".mcp.json", existing);
    const { cap } = await init({});
    expect(read(".mcp.json")).toBe(existing);
    expect(cap.out()).toContain(
      "skipped .mcp.json (Claude Code: the verbatra plugin enabled in .claude/settings.json brings its own server)",
    );
    expect(cap.out()).toContain("remove that entry or disable the plugin");
  });

  it("says it would skip under --dry-run", async () => {
    put(".claude/settings.json", enabled(true));
    const { cap } = await init({ dryRun: true });
    expect(cap.out()).toContain("would skip .mcp.json");
  });

  it.each([
    ["a disabled plugin", enabled(false)],
    ["another plugin", `${JSON.stringify({ enabledPlugins: { "other@x": true } })}\n`],
    ["no enabledPlugins", "{}\n"],
    ["a null document", "null\n"],
    ["a malformed settings file", "{ nope"],
  ])("wires .mcp.json beside %s", async (_label, content) => {
    put(".claude/settings.json", content);
    const result = await initJson();
    expect(result.agent.mcpServer).toBe("added");
    expect(existsSync(join(dir, ".mcp.json"))).toBe(true);
  });

  it("does not read a settings file behind a symbolic link", async () => {
    const outside = join(root, "outside-settings.json");
    writeFileSync(outside, enabled(true));
    mkdirSync(join(dir, ".claude"));
    symlinkSync(outside, join(dir, ".claude/settings.json"));
    const result = await initJson();
    expect(result.agent.mcpServer).toBe("added");
  });
});

describe("init --agent: path safety", () => {
  beforeEach(() => {
    put("verbatra.config.ts", CONFIG);
  });

  it("skips a detected client whose directory is a symbolic link, with a next step", async () => {
    const outside = join(root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(dir, ".cursor"));
    const result = await initJson();
    expect(result.agent.clients).toEqual([
      {
        id: "cursor",
        file: ".cursor/mcp.json",
        server: "skipped",
        reason: "symlink",
        selectedBy: "markers",
        markers: [".cursor/"],
      },
    ]);
    expect(result.files.map((file) => file.path)).toEqual(["verbatra.config.ts", "AGENTS.md"]);
    expect(result.nextSteps[0]?.description).toContain(
      "init did not wire Cursor: .cursor is a symbolic link",
    );
    expect(readdirSync(outside)).toEqual([]);
  });

  it("says it skipped a symlinked client in human output", async () => {
    put("real.json", "{}\n");
    symlinkSync(join(dir, "real.json"), join(dir, ".mcp.json"));
    const { code, cap } = await init({});
    expect(code).toBe(0);
    expect(cap.out()).toContain(
      "skipped .mcp.json (Claude Code: .mcp.json is a symbolic link, and init never writes through one)",
    );
    expect(read("real.json")).toBe("{}\n");
  });

  it.each([
    ["a client directory linked out of the project", "cursor", ".cursor", "dir"],
    ["a client file linked inside the project", "claude", ".mcp.json", "file"],
    ["a dangling link at a client file", "vscode", ".vscode/mcp.json", "missing"],
  ])("refuses %s when --client names it", async (_label, client, link, kind) => {
    const target = join(root, kind === "dir" ? "outside" : "target.json");
    if (kind === "dir") {
      mkdirSync(target);
    } else if (kind === "file") {
      writeFileSync(target, "{}\n");
    }
    mkdirSync(dirname(join(dir, link)), { recursive: true });
    symlinkSync(target, join(dir, link));
    await expectRefusal({ client }, "AGENT_FILE_INVALID", `behind the symbolic link ${link}`);
    const envelope = await init({ json: true, client });
    expect(parseEnvelope(envelope.cap.out()).message).toContain("or wire the client by hand");
  });

  it("refuses a client directory that is a file", async () => {
    put(".cursor", "not a directory\n");
    await expectRefusal(
      { client: "cursor" },
      "AGENT_FILE_INVALID",
      "needs .cursor to be a directory",
    );
  });

  it("refuses a client file that is a directory", async () => {
    mkdirSync(join(dir, ".vscode/mcp.json"), { recursive: true });
    await expectRefusal({}, "AGENT_FILE_INVALID", ".vscode/mcp.json is not a regular file");
  });

  it.each([
    ["links outside the project", "outside"],
    ["is a dangling link", "missing"],
  ])("refuses an instruction file that %s, without a client hint", async (_label, kind) => {
    const outside = join(root, "AGENTS.md");
    if (kind === "outside") {
      writeFileSync(outside, "# outside\n");
    }
    symlinkSync(outside, join(dir, "AGENTS.md"));
    const envelope = await expectRefusal(
      {},
      "AGENT_FILE_INVALID",
      "AGENTS.md is a symbolic link that does not resolve inside the project",
    );
    expect(envelope.message).not.toContain("wire the client");
    expect(existsSync(outside) ? readFileSync(outside, "utf8") : undefined).toBe(
      kind === "outside" ? "# outside\n" : undefined,
    );
  });

  it("refuses an instruction file that is a directory", async () => {
    mkdirSync(join(dir, "AGENTS.md"));
    await expectRefusal({}, "AGENT_FILE_INVALID", "AGENTS.md is not a regular file");
  });

  it.runIf(canDropReadAccess)("ignores a settings file it cannot read", async () => {
    put(".claude/settings.json", '{"enabledPlugins":{"verbatra@verbatra":true}}');
    chmodSync(join(dir, ".claude/settings.json"), 0o000);
    const result = await initJson();
    expect(result.agent.mcpServer).toBe("added");
  });

  it("writes through an instruction file linked inside the project", async () => {
    put("AGENTS.md", "# shared\n");
    symlinkSync(join(dir, "AGENTS.md"), join(dir, "CLAUDE.md"));
    const result = await initJson();
    expect(result.agent.instructionsFile).toBe("AGENTS.md");
    expect(read("CLAUDE.md")).toContain("<!-- verbatra:start -->");
    expect(lstatSync(join(dir, "CLAUDE.md")).isSymbolicLink()).toBe(true);
  });

  it("writes no provider key value into any file", async () => {
    const sentinel = "sentinel-key-value-never-written";
    const names = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "DEEPL_API_KEY",
      "GOOGLE_TRANSLATE_API_KEY",
      "OPENAI_COMPATIBLE_API_KEY",
      "LIBRETRANSLATE_API_KEY",
    ];
    for (const name of names) {
      process.env[name] = sentinel;
    }
    try {
      rmSync(join(dir, "verbatra.config.ts"));
      await initJson({ client: "all", provider: "gemini", yes: true });
    } finally {
      for (const name of names) {
        delete process.env[name];
      }
    }
    const written = Object.values(snapshot(root));
    expect(written.length).toBeGreaterThan(5);
    for (const content of written) {
      expect(content).not.toContain(sentinel);
    }
  });
});
