import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";
import {
  createLocalePathResolver,
  type DetectedFormat,
  type DetectedLocaleLayout,
  type DetectionAmbiguity,
  detectProject,
  type ProjectDetection,
  scaffoldingMetadata,
} from "@verbatra/sdk";
import {
  AGENT_CLIENT_CONFIGS,
  type AgentClientId,
  type ClientSelectedBy,
  parseClientFlag,
} from "./agent-clients.js";
import {
  type AgentScaffoldPlan,
  type ClientServerState,
  type ClientSkipReason,
  type McpServerState,
  type PlannedClient,
  planAgentScaffold,
} from "./agent-scaffold.js";
import type { CliErrorCode } from "./cli-error-codes.js";
import { CliUsageError } from "./cli-usage-error.js";
import { parentConfigDir } from "./config-presence.js";
import { assertCwdDirectory } from "./cwd-option.js";
import { planGitignore } from "./gitignore.js";
import {
  type DetectFn,
  type InitOptions,
  type InitPlan,
  type InitSources,
  initOptsSchema,
  type Prompter,
  planInit,
} from "./init-answers.js";
import {
  envExampleHeader,
  HUMAN_ONLY_PROVIDER,
  isEnvExampleHeader,
  isOptionalKey,
  keyEnvVarFor,
  namesEnvVar,
  type ProviderChoice,
  renderConfig,
  renderEnvExample,
} from "./init-config.js";
import { renderErrorEnvelope, renderSuccessEnvelope } from "./json-envelope.js";
import { type LinkPolicy, linkRefusal, writeProjectFile } from "./project-paths.js";
import { askLine, stdinIsTty } from "./prompt.js";
import { toRenderableError } from "./render.js";
import {
  DEFAULT_TERMINAL_SETTINGS,
  resolveTerminalMode,
  type TerminalSettings,
} from "./terminal-mode.js";
import type { Streams } from "./types.js";
import { createUi } from "./ui.js";

export { DEFAULT_MODEL } from "./init-config.js";

export interface InitDeps {
  readonly ask?: (question: string) => Promise<string>;
  readonly isTty?: () => boolean;
  readonly detect?: DetectFn;
}

export type FileAction = "created" | "overwritten" | "updated" | "unchanged";

export interface InitDetectedLayout
  extends Omit<DetectedLocaleLayout, "sourceLocale" | "unqualifiedSourceFile"> {
  readonly sourceLocale: string | null;
  readonly unqualifiedSourceFile: string | null;
}

export interface InitDetection {
  readonly format: DetectedFormat | null;
  readonly layout: InitDetectedLayout | null;
  readonly ambiguities: readonly DetectionAmbiguity[];
  readonly confidence: ProjectDetection["confidence"];
  readonly reasons: readonly string[];
}

export interface InitAgentClient {
  readonly id: AgentClientId;
  readonly file: string;
  readonly server: ClientServerState;
  readonly reason: ClientSkipReason | null;
  readonly selectedBy: ClientSelectedBy;
  readonly markers: readonly string[];
}

export interface InitAgentFiles {
  readonly instructionsFile: string;
  readonly mcpServer: ClientServerState | null;
  readonly configKept: boolean;
  readonly clients: readonly InitAgentClient[];
}

export interface InitResult {
  readonly configPath: string;
  readonly files: readonly WrittenFile[];
  readonly dryRun: boolean;
  readonly config: Readonly<Record<string, unknown>> | null;
  readonly sources: InitSources | null;
  readonly apiKeyEnvVar: string | null;
  readonly detection: InitDetection | null;
  readonly agent: InitAgentFiles | null;
  readonly nextSteps: readonly NextStep[];
}

const CONFIG_FILE = "verbatra.config.ts";
const ENV_EXAMPLE_FILE = ".env.example";

function hasVerbatraProperty(path: string): boolean {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof manifest === "object" && manifest !== null && "verbatra" in manifest;
  } catch {
    return false;
  }
}

function competingConfig(cwd: string): string | undefined {
  return scaffoldingMetadata.configSearchPlaces.find((name) => {
    if (name === CONFIG_FILE) {
      return false;
    }
    const path = resolve(cwd, name);
    if (!existsSync(path)) {
      return false;
    }
    return name !== "package.json" || hasVerbatraProperty(path);
  });
}

function assertNoCompetingConfig(cwd: string): void {
  const competing = competingConfig(cwd);
  if (competing !== undefined) {
    throw new CliUsageError(
      "CONFIG_EXISTS",
      `${competing} already configures verbatra in this directory and would be read before ${CONFIG_FILE}. Edit it, or remove it and run init again.`,
    );
  }
}

function existingConfigError(): CliUsageError {
  return new CliUsageError(
    "CONFIG_EXISTS",
    `${CONFIG_FILE} already exists in this directory. Pass --force to write a new one over it, or edit it by hand.`,
  );
}

function configAction(cwd: string, content: string, force: boolean): FileAction {
  assertNoCompetingConfig(cwd);
  const path = resolve(cwd, CONFIG_FILE);
  if (!existsSync(path)) {
    return "created";
  }
  if (readFileSync(path, "utf8") === content) {
    return "unchanged";
  }
  if (!force) {
    throw new CliUsageError(
      "CONFIG_EXISTS",
      `${CONFIG_FILE} already exists with different content. Pass --force to overwrite it, or edit it by hand.`,
    );
  }
  return "overwritten";
}

function withRefreshedHeader(content: string, header: string): string {
  const end = content.search(/\r?\n|$/);
  const firstLine = content.slice(0, end);
  if (!isEnvExampleHeader(firstLine) || firstLine === header) {
    return content;
  }
  return `${header}${content.slice(end)}`;
}

function planEnvExample(
  cwd: string,
  choice: ProviderChoice,
  envVar: string,
  force: boolean,
): PlannedWrite {
  const path = resolve(cwd, ENV_EXAMPLE_FILE);
  const planned = (action: FileAction, content: string): PlannedWrite => ({
    path: ENV_EXAMPLE_FILE,
    kind: "base",
    action,
    content,
    note: undefined,
  });
  if (!existsSync(path)) {
    return planned("created", renderEnvExample(choice, envVar));
  }
  const existing = readFileSync(path, "utf8");
  const content = force
    ? withRefreshedHeader(existing, envExampleHeader(choice, envVar))
    : existing;
  if (namesEnvVar(content, envVar)) {
    return planned(content === existing ? "unchanged" : "updated", content);
  }
  const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return planned("updated", `${content}${separator}${envVar}=\n`);
}

interface WrittenFile {
  readonly path: string;
  readonly action: FileAction;
}

type WriteKind = "base" | "instructions" | "client";

interface PlannedWrite extends WrittenFile {
  readonly kind: WriteKind;
  readonly content: string;
  readonly note: string | undefined;
}

const LINK_POLICY: Record<WriteKind, LinkPolicy> = {
  base: "stay-inside",
  instructions: "stay-inside",
  client: "never-follow",
};

const LINK_REFUSAL_CODE: Record<WriteKind, CliErrorCode> = {
  base: "INIT_UNWRITABLE",
  instructions: "AGENT_FILE_INVALID",
  client: "AGENT_FILE_INVALID",
};

interface Commit {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly streams: Streams;
  readonly files: WrittenFile[];
}

const SILENT_STREAMS: Streams = { out: () => {}, err: () => {} };

const ERRNO_CODE = /^E[A-Z0-9]+$/;

function errnoCode(error: unknown): string | undefined {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  return typeof code === "string" && ERRNO_CODE.test(code) ? code : undefined;
}

function writing<T>(file: string, cwd: string, written: readonly WrittenFile[], write: () => T): T {
  try {
    return write();
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) {
      throw error;
    }
    throw new CliUsageError(
      "INIT_UNWRITABLE",
      `init could not write ${file} in ${cwd} (${code}). ${keptSentence(written)} Make the directory writable, or pass --cwd <path> naming a writable one, and run init again.`,
    );
  }
}

function keptSentence(written: readonly WrittenFile[]): string {
  const changed = written
    .filter((entry) => entry.action !== "unchanged")
    .map((entry) => entry.path);
  return changed.length === 0
    ? "Nothing was written."
    : `${changed.join(" and ")} ${changed.length === 1 ? "was" : "were"} already written.`;
}

function linkedAway(code: CliErrorCode, file: string, reason: string, kept: string): CliUsageError {
  return new CliUsageError(
    code,
    `${file} ${reason}, so init will not read or write through it. ${kept} Replace it with a plain file inside the project and run init again.`,
  );
}

function assertBaseFileInside(cwd: string, file: string): void {
  const refusal = linkRefusal(cwd, file, "stay-inside");
  if (refusal !== undefined) {
    throw linkedAway("INIT_UNWRITABLE", file, refusal, "Nothing was written.");
  }
}

const DONE_VERB: Record<FileAction, string> = {
  created: "created",
  overwritten: "overwrote",
  updated: "updated",
  unchanged: "unchanged",
};

const PLANNED_VERB: Record<FileAction, string> = {
  created: "would create",
  overwritten: "would overwrite",
  updated: "would update",
  unchanged: "unchanged",
};

function reportLine(write: PlannedWrite, dryRun: boolean): string {
  const verb = (dryRun ? PLANNED_VERB : DONE_VERB)[write.action];
  return `${verb} ${write.path}${write.note === undefined ? "" : ` (${write.note})`}\n`;
}

function commitWrite(write: PlannedWrite, commit: Commit): void {
  if (!commit.dryRun && write.action !== "unchanged") {
    const policy = LINK_POLICY[write.kind];
    const refusal = linkRefusal(commit.cwd, write.path, policy);
    if (refusal !== undefined) {
      const code = LINK_REFUSAL_CODE[write.kind];
      throw linkedAway(code, write.path, refusal, keptSentence(commit.files));
    }
    writing(write.path, commit.cwd, commit.files, () =>
      writeProjectFile(commit.cwd, write.path, write.content, policy),
    );
  }
  commit.streams.out(reportLine(write, commit.dryRun));
  commit.files.push({ path: write.path, action: write.action });
}

const MCP_SERVER_NOTE: Record<McpServerState, string> = {
  added: "verbatra MCP server added, spending off",
  present: "verbatra MCP server already present",
  differs: "its verbatra server differs from the scaffold and was left as it is",
};

function clientName(client: PlannedClient): string {
  return AGENT_CLIENT_CONFIGS[client.id].name;
}

function clientsLine(agent: AgentScaffoldPlan): string {
  const names = agent.clients.map(clientName);
  const how = agent.clients[0]?.selectedBy;
  if (how === "flag") {
    return `agent clients: ${names.join(", ")} (from --client)\n`;
  }
  if (how === "default") {
    return `agent clients: ${names.join(", ")} (no client marker found)\n`;
  }
  const found = agent.clients.map(
    (client) => `${clientName(client)} (found ${client.markers.join(", ")})`,
  );
  return `agent clients: ${found.join(", ")}\n`;
}

function skipCause(client: PlannedClient, agent: AgentScaffoldPlan): string {
  return client.reason === "symlink"
    ? `${client.link} is a symbolic link, and init never writes through one`
    : `the verbatra plugin enabled in ${agent.pluginSetting} brings its own server`;
}

function skippedLine(client: PlannedClient, agent: AgentScaffoldPlan, dryRun: boolean): string {
  const verb = dryRun ? "would skip" : "skipped";
  return `${verb} ${client.file} (${clientName(client)}: ${skipCause(client, agent)})\n`;
}

function commitAgent(agent: AgentScaffoldPlan, commit: Commit): void {
  commit.streams.out(clientsLine(agent));
  commitWrite(
    { ...agent.instructions, kind: "instructions", note: "verbatra section for coding agents" },
    commit,
  );
  for (const client of agent.clients) {
    if (client.write === undefined) {
      commit.streams.out(skippedLine(client, agent, commit.dryRun));
    } else {
      const { server, ...write } = client.write;
      const note = `${clientName(client)}: ${MCP_SERVER_NOTE[server]}`;
      commitWrite({ ...write, kind: "client", note }, commit);
    }
  }
}

function baseWrites(plan: InitPlan, cwd: string, force: boolean): readonly PlannedWrite[] {
  const envVar = keyEnvVarFor(plan.draft.provider);
  for (const file of [
    CONFIG_FILE,
    ...(envVar === undefined ? [] : [ENV_EXAMPLE_FILE]),
    ".gitignore",
  ]) {
    assertBaseFileInside(cwd, file);
  }
  const content = renderConfig(plan.draft);
  const action = configAction(cwd, content, force);
  const writes: PlannedWrite[] = [
    { path: CONFIG_FILE, kind: "base", action, content, note: undefined },
  ];
  if (envVar !== undefined) {
    writes.push(
      writing(ENV_EXAMPLE_FILE, cwd, [], () =>
        planEnvExample(cwd, plan.draft.provider, envVar, force),
      ),
    );
  }
  const gitignore = writing(".gitignore", cwd, [], () => planGitignore(cwd));
  writes.push({ path: ".gitignore", kind: "base", ...gitignore });
  return writes;
}

function commitAll(
  writes: readonly PlannedWrite[],
  agent: AgentScaffoldPlan | undefined,
  commit: Commit,
): readonly WrittenFile[] {
  for (const write of writes) {
    commitWrite(write, commit);
  }
  if (agent !== undefined) {
    commitAgent(agent, commit);
  }
  return commit.files;
}

export interface NextStep {
  readonly description: string;
  readonly command: string | null;
}

function shellQuote(value: string): string {
  return /^[\w./:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

const PROJECT_ROOT = resolve("/project");

function sourceFileFor(plan: InitPlan): string | undefined {
  const { pattern, localeStyle, sourceLocale, format } = plan.draft;
  try {
    const resolver = createLocalePathResolver(PROJECT_ROOT, {
      sourceLocale,
      targetLocales: [],
      format,
      files: { pattern, localeStyle },
    });
    return relative(PROJECT_ROOT, resolver.pathFor(sourceLocale)).replaceAll("\\", "/");
  } catch {
    return undefined;
  }
}

function sourceFileStep(plan: InitPlan): NextStep | undefined {
  const unqualified = plan.detection.layout?.unqualifiedSourceFile;
  const sourceFile = unqualified === undefined ? undefined : sourceFileFor(plan);
  if (unqualified === undefined || sourceFile === undefined) {
    return undefined;
  }
  const locale = plan.draft.sourceLocale;
  return {
    description: plan.detection.layout?.files.includes(sourceFile)
      ? `verbatra reads the ${locale} source strings from ${sourceFile}, never from ${unqualified}. Keep the two in step, or retire ${unqualified}.`
      : `verbatra reads the ${locale} source strings from ${sourceFile}, never from ${unqualified}. Rename or copy ${unqualified} to ${sourceFile} before the first run.`,
    command: null,
  };
}

const MCP_SETUP_DOCS = "https://verbatra.kreitz-webdev.de/docs/connect-an-mcp-client";

const CLIENT_DOCS_ANCHOR: Record<AgentClientId, string> = {
  claude: "claude-code",
  cursor: "cursor",
  vscode: "vs-code",
  codex: "codex",
  gemini: "gemini-cli",
};

function differsStep(client: PlannedClient): NextStep {
  return {
    description: `${client.file} already names a verbatra server that differs from the one init scaffolds for ${clientName(client)}, so init left it as it is. Compare it with ${MCP_SETUP_DOCS}#${CLIENT_DOCS_ANCHOR[client.id]}.`,
    command: null,
  };
}

function pluginStep(client: PlannedClient, setting: string | undefined): NextStep {
  return {
    description: `The verbatra Claude Code plugin is enabled in ${setting} and brings its own verbatra server, so init left ${client.file} alone. If ${client.file} already names a verbatra server, remove that entry or disable the plugin: the two together start two servers.`,
    command: null,
  };
}

function symlinkStep(client: PlannedClient): NextStep {
  return {
    description: `init did not wire ${clientName(client)}: ${client.link} is a symbolic link, and init never writes through one. Add the entry from ${MCP_SETUP_DOCS}#${CLIENT_DOCS_ANCHOR[client.id]} to ${client.file} by hand, or replace the link with a plain directory or file and run init again.`,
    command: null,
  };
}

function clientStep(client: PlannedClient, agent: AgentScaffoldPlan): readonly NextStep[] {
  if (client.server === "differs") {
    return [differsStep(client)];
  }
  if (client.reason === "symlink") {
    return [symlinkStep(client)];
  }
  return client.reason === "plugin" ? [pluginStep(client, agent.pluginSetting)] : [];
}

function agentSteps(agent: AgentScaffoldPlan | undefined, suffix: string): readonly NextStep[] {
  if (agent === undefined) {
    return [];
  }
  const steps = agent.clients.flatMap((client) => clientStep(client, agent));
  if (agent.vscodeHint) {
    steps.push({
      description:
        "This project has a .vscode folder but no .vscode/mcp.json, so init did not wire VS Code. Run this to add it.",
      command: `npx verbatra init --agent --client vscode${suffix}`,
    });
  }
  return steps;
}

const DRY_RUN_STEP: NextStep = {
  description: "Nothing was written. Run the same command without --dry-run to write these files.",
  command: null,
};

function leadingSteps(
  agent: AgentScaffoldPlan | undefined,
  suffix: string,
  dryRun: boolean,
): NextStep[] {
  return [...(dryRun ? [DRY_RUN_STEP] : []), ...agentSteps(agent, suffix)];
}

function cwdSuffix(cwdFlag: string | undefined): string {
  return cwdFlag === undefined ? "" : ` --cwd ${shellQuote(cwdFlag)}`;
}

function doctorStep(suffix: string): NextStep {
  return {
    description: "Check the setup. It calls no provider and reads no key value.",
    command: `npx verbatra doctor${suffix}`,
  };
}

function nextSteps(
  plan: InitPlan,
  agent: AgentScaffoldPlan | undefined,
  cwdFlag: string | undefined,
  dryRun: boolean,
): readonly NextStep[] {
  const suffix = cwdSuffix(cwdFlag);
  const steps = leadingSteps(agent, suffix, dryRun);
  if (plan.sources.format === "default") {
    steps.push({
      description: `Set format in ${CONFIG_FILE}: init found no locale file to detect it from.`,
      command: null,
    });
  }
  const envVar = keyEnvVarFor(plan.draft.provider);
  if (envVar !== undefined) {
    steps.push({
      description: isOptionalKey(plan.draft.provider)
        ? `Set ${envVar} in .env only if your server requires a key. Never commit .env.`
        : `Copy ${ENV_EXAMPLE_FILE} to .env and set ${envVar} there. Never commit .env.`,
      command: null,
    });
  }
  const rename = sourceFileStep(plan);
  if (rename !== undefined) {
    steps.push(rename);
  }
  steps.push(doctorStep(suffix));
  steps.push(
    plan.draft.provider.id === HUMAN_ONLY_PROVIDER
      ? {
          description: "Hand the untranslated keys to a person as a workbook.",
          command: `npx verbatra export${suffix}`,
        }
      : {
          description: "Preview what a run would translate, without calling the provider.",
          command: `npx verbatra translate --dry-run --json${suffix}`,
        },
  );
  return steps;
}

function detectionForJson(detection: ProjectDetection): InitDetection {
  const layout = detection.layout;
  return {
    format: detection.format ?? null,
    layout:
      layout === undefined
        ? null
        : {
            ...layout,
            sourceLocale: layout.sourceLocale ?? null,
            unqualifiedSourceFile: layout.unqualifiedSourceFile ?? null,
          },
    ambiguities: detection.ambiguities,
    confidence: detection.confidence,
    reasons: detection.reasons,
  };
}

function clientForJson(client: PlannedClient): InitAgentClient {
  return {
    id: client.id,
    file: client.file,
    server: client.server,
    reason: client.reason,
    selectedBy: client.selectedBy,
    markers: client.markers,
  };
}

function agentForJson(
  agent: AgentScaffoldPlan | undefined,
  configKept: boolean,
): InitAgentFiles | null {
  if (agent === undefined) {
    return null;
  }
  const claude = agent.clients.find((client) => client.id === "claude");
  return {
    instructionsFile: agent.instructions.path,
    mcpServer: claude?.server ?? null,
    configKept,
    clients: agent.clients.map(clientForJson),
  };
}

function renderDetectionHuman(detection: ProjectDetection): string | undefined {
  if (detection.confidence === "none") {
    return undefined;
  }
  const parts = [
    detection.format === undefined ? undefined : `format ${detection.format.id}`,
    detection.layout === undefined ? undefined : `pattern ${detection.layout.pattern}`,
    detection.layout === undefined || detection.layout.locales.length === 0
      ? undefined
      : `locales ${detection.layout.locales.join(", ")}`,
  ].filter((part) => part !== undefined);
  return `detected ${parts.join(", ")} (confidence: ${detection.confidence})`;
}

function renderNextStepsHuman(steps: readonly NextStep[]): string {
  const lines = steps.map((step) =>
    step.command === null
      ? `  - ${step.description}`
      : `  - ${step.command}  (${step.description})`,
  );
  return ["next steps:", ...lines].join("\n");
}

function interactiveMode(opts: InitOptions, isTty: () => boolean): boolean {
  return opts.yes !== true && opts.json !== true && isTty();
}

async function planOrExisting(
  opts: InitOptions,
  cwd: string,
  prompter: Prompter,
  detect: DetectFn,
): Promise<InitPlan> {
  assertNoCompetingConfig(cwd);
  const existing = opts.force !== true && existsSync(resolve(cwd, CONFIG_FILE));
  if (existing && prompter.interactive) {
    throw existingConfigError();
  }
  try {
    return await planInit(opts, cwd, prompter, detect);
  } catch (error) {
    throw existing && error instanceof CliUsageError ? existingConfigError() : error;
  }
}

const CONFIG_ANSWER_FLAGS = [
  ["provider", "--provider"],
  ["source", "--source"],
  ["targets", "--targets"],
  ["path", "--path"],
  ["format", "--format"],
  ["model", "--model"],
  ["baseUrl", "--base-url"],
  ["apiKeyEnvVar", "--api-key-env-var"],
] as const;

function wouldRewriteConfig(opts: InitOptions): boolean {
  return opts.force === true || CONFIG_ANSWER_FLAGS.some(([option]) => opts[option] !== undefined);
}

function existingConfigFile(cwd: string): string | undefined {
  return existsSync(resolve(cwd, CONFIG_FILE)) ? CONFIG_FILE : competingConfig(cwd);
}

function agentOnlyConfigFile(opts: InitOptions, cwd: string): string | undefined {
  if (opts.agent !== true || wouldRewriteConfig(opts)) {
    return undefined;
  }
  return existingConfigFile(cwd);
}

interface AgentRun {
  readonly opts: InitOptions;
  readonly cwd: string;
  readonly json: boolean;
  readonly dryRun: boolean;
  readonly clients: readonly AgentClientId[] | undefined;
}

function runAgentOnly(configFile: string, run: AgentRun, streams: Streams): number {
  const agent = planAgentScaffold(run.cwd, run.clients);
  const out = run.json ? SILENT_STREAMS : streams;
  out.out(`kept ${configFile} (already configured; --agent adds only the agent files)\n`);
  const files = commitAll([], agent, {
    cwd: run.cwd,
    dryRun: run.dryRun,
    streams: out,
    files: [{ path: configFile, action: "unchanged" }],
  });
  const suffix = cwdSuffix(run.opts.cwd);
  const steps = [...leadingSteps(agent, suffix, run.dryRun), doctorStep(suffix)];
  if (run.json) {
    streams.out(
      `${renderSuccessEnvelope<InitResult>("init", {
        configPath: resolve(run.cwd, configFile),
        files,
        dryRun: run.dryRun,
        config: null,
        sources: null,
        apiKeyEnvVar: null,
        detection: null,
        agent: agentForJson(agent, true),
        nextSteps: steps,
      })}\n`,
    );
    return 0;
  }
  streams.out(`${renderNextStepsHuman(steps)}\n`);
  return 0;
}

const AGENT_ONLY_HINT = ` To keep it and add only the agent files, run init --agent without --force and without ${CONFIG_ANSWER_FLAGS.map(([, flag]) => flag).join(", ")}.`;

function withAgentOnlyHint(error: unknown, agent: boolean): unknown {
  if (!agent || !(error instanceof CliUsageError) || error.code !== "CONFIG_EXISTS") {
    return error;
  }
  return new CliUsageError(
    error.code,
    `${error.message}${AGENT_ONLY_HINT}`,
    error.candidates,
    error.missing,
  );
}

function renderFailure(
  error: unknown,
  json: boolean,
  streams: Streams,
  settings: TerminalSettings,
): number {
  const renderable = toRenderableError(error);
  const terminal = resolveTerminalMode(settings.facts, {
    json,
    quiet: settings.quiet,
    color: settings.color,
  });
  createUi(streams, terminal).error(renderable);
  if (json) {
    streams.out(`${renderErrorEnvelope("init", renderable)}\n`);
  }
  return 2;
}

function warnShadowedConfig(
  shadowed: string | undefined,
  cwd: string,
  dryRun: boolean,
  streams: Streams,
): void {
  if (shadowed === undefined) {
    return;
  }
  const verb = dryRun ? "would take" : "takes";
  streams.err(
    `verbatra: the config in ${shadowed} also covers this directory; from here on, ${CONFIG_FILE} in ${resolve(cwd)} ${verb} its place. Delete one of them if that is not what you want.\n`,
  );
}

export async function runInit(
  rawOpts: unknown,
  streams: Streams,
  deps: InitDeps = {},
  settings: TerminalSettings = DEFAULT_TERMINAL_SETTINGS,
): Promise<number> {
  const parsed = initOptsSchema.safeParse(rawOpts);
  const json = parsed.success && parsed.data.json === true;
  const agentRequested = parsed.success && parsed.data.agent === true;
  try {
    const opts = initOptsSchema.parse(rawOpts);
    const clients = parseClientFlag(opts.client, opts.agent === true);
    const cwd = opts.cwd ?? process.cwd();
    if (opts.cwd !== undefined) {
      assertCwdDirectory(cwd);
    }
    const dryRun = opts.dryRun === true;
    const keptConfig = agentOnlyConfigFile(opts, cwd);
    if (keptConfig !== undefined) {
      return runAgentOnly(keptConfig, { opts, cwd, json, dryRun, clients }, streams);
    }
    const prompter: Prompter = {
      interactive: interactiveMode(opts, deps.isTty ?? stdinIsTty),
      acceptDefaults: opts.yes === true,
      ask: deps.ask ?? ((question: string) => askLine(question, streams)),
      warn: (message) => streams.err(`${message}\n`),
    };
    const plan = await planOrExisting(opts, cwd, prompter, deps.detect ?? detectProject);
    const agent = opts.agent === true ? planAgentScaffold(cwd, clients) : undefined;
    const writes = baseWrites(plan, cwd, opts.force === true);
    const out = json ? SILENT_STREAMS : streams;
    const shadowed = parentConfigDir(cwd);
    const files = commitAll(writes, agent, { cwd, dryRun, streams: out, files: [] });
    warnShadowedConfig(shadowed, cwd, dryRun, streams);
    const steps = nextSteps(plan, agent, opts.cwd, dryRun);
    if (json) {
      const keyEnvVar = keyEnvVarFor(plan.draft.provider);
      streams.out(
        `${renderSuccessEnvelope<InitResult>("init", {
          configPath: resolve(cwd, CONFIG_FILE),
          files,
          dryRun,
          config: plan.candidate,
          sources: plan.sources,
          apiKeyEnvVar: keyEnvVar ?? null,
          detection: detectionForJson(plan.detection),
          agent: agentForJson(agent, false),
          nextSteps: steps,
        })}\n`,
      );
      return 0;
    }
    const detected = renderDetectionHuman(plan.detection);
    if (detected !== undefined) {
      streams.out(`${detected}\n`);
    }
    streams.out(`${renderNextStepsHuman(steps)}\n`);
    return 0;
  } catch (error) {
    return renderFailure(withAgentOnlyHint(error, agentRequested), json, streams, settings);
  }
}
