import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { detectProject, type ProjectDetection, scaffoldingMetadata } from "@verbatra/sdk";
import { CliUsageError } from "./cli-usage-error.js";
import { ensureGitignore, type GitignoreAction } from "./gitignore.js";
import {
  type DetectFn,
  type InitOptions,
  type InitPlan,
  initOptsSchema,
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
import { askLine, stdinIsTty } from "./prompt.js";
import { renderError, toRenderableError } from "./render.js";
import type { Streams } from "./types.js";

export { DEFAULT_MODEL } from "./init-config.js";

export interface InitDeps {
  readonly ask?: (question: string) => Promise<string>;
  readonly isTty?: () => boolean;
  readonly detect?: DetectFn;
}

export type FileAction = "created" | "overwritten" | "updated" | "unchanged";

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

function configAction(cwd: string, content: string, force: boolean): FileAction {
  const competing = competingConfig(cwd);
  if (competing !== undefined) {
    throw new CliUsageError(
      "CONFIG_EXISTS",
      `${competing} already configures verbatra in this directory and would be read before ${CONFIG_FILE}. Edit it, or remove it and run init again.`,
    );
  }
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

function writeEnvExample(
  cwd: string,
  choice: ProviderChoice,
  envVar: string,
  force: boolean,
): FileAction {
  const path = resolve(cwd, ENV_EXAMPLE_FILE);
  if (!existsSync(path)) {
    writeFileSync(path, renderEnvExample(choice, envVar));
    return "created";
  }
  const existing = readFileSync(path, "utf8");
  const content = force
    ? withRefreshedHeader(existing, envExampleHeader(choice, envVar))
    : existing;
  if (namesEnvVar(content, envVar)) {
    if (content === existing) {
      return "unchanged";
    }
    writeFileSync(path, content);
    return "updated";
  }
  const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  writeFileSync(path, `${content}${separator}${envVar}=\n`);
  return "updated";
}

interface WrittenFile {
  readonly path: string;
  readonly action: FileAction;
}

const SILENT_STREAMS: Streams = { out: () => {}, err: () => {} };

function writePlan(
  plan: InitPlan,
  cwd: string,
  force: boolean,
  streams: Streams,
): readonly WrittenFile[] {
  const content = renderConfig(plan.draft);
  const action = configAction(cwd, content, force);
  if (action !== "unchanged") {
    writeFileSync(resolve(cwd, CONFIG_FILE), content);
  }
  streams.out(`${action === "overwritten" ? "overwrote" : action} ${CONFIG_FILE}\n`);
  const files: WrittenFile[] = [{ path: CONFIG_FILE, action }];
  const envVar = keyEnvVarFor(plan.draft.provider);
  if (envVar !== undefined) {
    const envAction = writeEnvExample(cwd, plan.draft.provider, envVar, force);
    streams.out(`${envAction} ${ENV_EXAMPLE_FILE}\n`);
    files.push({ path: ENV_EXAMPLE_FILE, action: envAction });
  }
  const gitignore: GitignoreAction = ensureGitignore(cwd, streams);
  files.push({ path: ".gitignore", action: gitignore });
  return files;
}

export interface NextStep {
  readonly description: string;
  readonly command: string | null;
}

function shellQuote(value: string): string {
  return /^[\w./:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function sourceFileFor(plan: InitPlan): string {
  const { pattern, localeStyle, sourceLocale } = plan.draft;
  const spelled = localeStyle === "posix" ? sourceLocale.replaceAll("-", "_") : sourceLocale;
  return pattern.replaceAll("{locale}", spelled);
}

function sourceFileStep(plan: InitPlan): NextStep | undefined {
  const unqualified = plan.detection.layout?.unqualifiedSourceFile;
  if (unqualified === undefined) {
    return undefined;
  }
  const sourceFile = sourceFileFor(plan);
  const locale = plan.draft.sourceLocale;
  return {
    description: plan.detection.layout?.files.includes(sourceFile)
      ? `verbatra reads the ${locale} source strings from ${sourceFile}, never from ${unqualified}. Keep the two in step, or retire ${unqualified}.`
      : `verbatra reads the ${locale} source strings from ${sourceFile}, never from ${unqualified}. Rename or copy ${unqualified} to ${sourceFile} before the first run.`,
    command: null,
  };
}

function nextSteps(plan: InitPlan, cwdFlag: string | undefined): readonly NextStep[] {
  const suffix = cwdFlag === undefined ? "" : ` --cwd ${shellQuote(cwdFlag)}`;
  const steps: NextStep[] = [];
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
  steps.push({
    description: "Check the setup. It calls no provider and reads no key value.",
    command: `npx verbatra doctor${suffix}`,
  });
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

function detectionForJson(detection: ProjectDetection): unknown {
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

function renderFailure(error: unknown, json: boolean, streams: Streams): number {
  const renderable = toRenderableError(error);
  streams.err(`${renderError(renderable)}\n`);
  if (json) {
    streams.out(`${renderErrorEnvelope("init", renderable)}\n`);
  }
  return 2;
}

export async function runInit(
  rawOpts: unknown,
  streams: Streams,
  deps: InitDeps = {},
): Promise<number> {
  const parsed = initOptsSchema.safeParse(rawOpts);
  const json = parsed.success && parsed.data.json === true;
  try {
    const opts = initOptsSchema.parse(rawOpts);
    const cwd = opts.cwd ?? process.cwd();
    const prompter = {
      interactive: interactiveMode(opts, deps.isTty ?? stdinIsTty),
      acceptDefaults: opts.yes === true,
      ask: deps.ask ?? askLine,
    };
    const plan = await planInit(opts, cwd, prompter, deps.detect ?? detectProject);
    const files = writePlan(plan, cwd, opts.force === true, json ? SILENT_STREAMS : streams);
    const steps = nextSteps(plan, opts.cwd);
    if (json) {
      const keyEnvVar = keyEnvVarFor(plan.draft.provider);
      streams.out(
        `${renderSuccessEnvelope("init", {
          configPath: resolve(cwd, CONFIG_FILE),
          files,
          config: plan.candidate,
          sources: plan.sources,
          apiKeyEnvVar: keyEnvVar ?? null,
          detection: detectionForJson(plan.detection),
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
    return renderFailure(error, json, streams);
  }
}
