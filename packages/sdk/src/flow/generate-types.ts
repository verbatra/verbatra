import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { FormatId, TranslationEntry } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { CACHE_FILE_NAME } from "../cache/translation-memory.js";
import { CONFIG_SEARCH_PLACES } from "../config/load-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage, SdkError } from "../errors.js";
import { type BoundedFileRead, defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import {
  describeIcuMessageArguments,
  describeMessageArguments,
  type MessageArguments,
  type UnresolvedArgumentReason,
} from "./message-arguments.js";
import { readSourceResource } from "./source.js";
import {
  type DeclaredMessage,
  GENERATED_HEADER,
  renderTypesDeclaration,
} from "./types-declaration.js";

/**
 * Where {@link generateTypes} writes its declaration when the caller names no path: a `.d.ts` at
 * the root of the working directory. The file is a checked-in artifact, not a local scratch file:
 * it belongs in version control so a consumer type-checks against it without running verbatra
 * first, and so `check` mode has a committed file to compare against.
 */
export const DEFAULT_TYPES_PATH = "verbatra-types.d.ts";

/** One key whose arguments verbatra declined to describe, and why. */
export interface UnresolvedMessage {
  /** The key, which is still declared, with arguments nothing is claimed about. */
  readonly key: string;
  /** Why the arguments could not be determined. */
  readonly reason: UnresolvedArgumentReason;
}

/** Input for {@link generateTypes}. */
export interface GenerateTypesInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` and the output path are resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /**
   * Where to write the declaration, relative to `cwd`. Defaults to {@link DEFAULT_TYPES_PATH}.
   * Refused with `TYPES_OUTPUT_CONFLICT`, before anything is read or written, when it names no
   * file, is absolute, climbs out of `cwd`, does not end in `.ts`, `.mts` or `.cts`, or names a
   * configured locale file, the lock file, the translation-memory cache, a file verbatra searches
   * for its configuration, or the {@link GenerateTypesInput.configPath} file. Names are compared
   * case-insensitively. A generating run also refuses to replace an existing file there unless
   * that file begins with the header line verbatra writes.
   */
  readonly out?: string;
  /**
   * The configuration file `config` was loaded from, absolute or relative to `cwd`. It is refused
   * as the output path even when its name is not one verbatra searches for.
   */
  readonly configPath?: string;
  /**
   * Compare instead of writing. The run reports whether the file on disk matches what a fresh
   * generation would produce and leaves every file untouched.
   */
  readonly check?: boolean;
}

/** Injectable dependencies for {@link generateTypes}. Every field has a working default. */
export interface GenerateTypesDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** The result of {@link generateTypes}: what was declared, and whether the file on disk matched. */
export interface GenerateTypesResult {
  /** Absolute path of the declaration file. */
  readonly path: string;
  /** The source catalog the declaration was built from, relative to the working directory. */
  readonly sourcePath: string;
  /** How many keys the declaration carries. */
  readonly keys: number;
  /**
   * How many of those keys take at least one argument verbatra could determine. A key listed in
   * {@link GenerateTypesResult.unresolved} is not counted here.
   */
  readonly withArguments: number;
  /** Keys that are declared but whose arguments could not be determined, and why. */
  readonly unresolved: readonly UnresolvedMessage[];
  /** Keys the adapter reported as excluded from translation, which are never declared. */
  readonly excluded: readonly string[];
  /** Keys the adapter marked as carrying plural forms. Each sibling is declared on its own. */
  readonly plural: readonly string[];
  /** Whether the declaration file was written. Always false in `check` mode. */
  readonly written: boolean;
  /** Whether the file on disk differed from the freshly generated declaration when the run started. */
  readonly stale: boolean;
  /** Whether this was a `check` run. */
  readonly check: boolean;
}

function escapesWorkingDirectory(inside: string): boolean {
  return inside === "" || inside === ".." || inside.startsWith(`..${sep}`);
}

export const TYPES_OUTPUT_REFUSALS = [
  "names-no-file",
  "absolute",
  "outside-working-directory",
  "not-typescript",
  "locale-file",
  "lock-file",
  "translation-memory-cache",
  "config-search-place",
  "loaded-config",
  "not-generated-by-verbatra",
] as const;

export type TypesOutputRefusal = (typeof TYPES_OUTPUT_REFUSALS)[number];

const RELATIVE_PATH_HINT = `Pass a relative path naming a file inside the working directory, or omit it to use ${DEFAULT_TYPES_PATH}.`;

const REFUSAL_HINTS: Readonly<Record<TypesOutputRefusal, string>> = {
  "names-no-file": RELATIVE_PATH_HINT,
  absolute: RELATIVE_PATH_HINT,
  "outside-working-directory": RELATIVE_PATH_HINT,
  "not-typescript": RELATIVE_PATH_HINT,
  "locale-file": RELATIVE_PATH_HINT,
  "lock-file": RELATIVE_PATH_HINT,
  "translation-memory-cache": RELATIVE_PATH_HINT,
  "config-search-place": RELATIVE_PATH_HINT,
  "loaded-config": RELATIVE_PATH_HINT,
  "not-generated-by-verbatra":
    "Pass a different --out path, or delete the file if it really is an old declaration.",
};

function refuseOutput(requested: string, refusal: TypesOutputRefusal, why: string): never {
  throw new SdkError(
    "TYPES_OUTPUT_CONFLICT",
    `The output path "${requested}" ${why} ${REFUSAL_HINTS[refusal]}`,
  );
}

interface ReservedPath {
  readonly refusal: TypesOutputRefusal;
  readonly what: string;
}

const TYPESCRIPT_EXTENSIONS = [".ts", ".mts", ".cts"];

function reservedPaths(
  cwd: string,
  input: GenerateTypesInput,
  resolver: LocalePathResolver,
): Map<string, ReservedPath> {
  const { config } = input;
  const reserved = new Map<string, ReservedPath>();
  const claim = (path: string, refusal: TypesOutputRefusal, what: string): void => {
    reserved.set(path.toLowerCase(), { refusal, what });
  };
  for (const locale of [config.sourceLocale, ...config.targetLocales]) {
    claim(resolver.pathFor(locale), "locale-file", `the locale file for "${locale}"`);
  }
  claim(
    resolve(cwd, LOCK_FILE_NAME),
    "lock-file",
    "the lock file, which holds the translation baseline",
  );
  claim(resolve(cwd, CACHE_FILE_NAME), "translation-memory-cache", "the translation-memory cache");
  for (const place of CONFIG_SEARCH_PLACES) {
    claim(
      resolve(cwd, place),
      "config-search-place",
      "a file verbatra loads its configuration from",
    );
  }
  if (input.configPath !== undefined) {
    claim(
      resolve(cwd, input.configPath),
      "loaded-config",
      "the configuration file this run loaded",
    );
  }
  return reserved;
}

function resolveOutputPath(
  cwd: string,
  out: string | undefined,
  reserved: ReadonlyMap<string, ReservedPath>,
): string {
  const requested = out ?? DEFAULT_TYPES_PATH;
  if (requested.trim() === "") {
    refuseOutput(requested, "names-no-file", "names no file.");
  }
  if (isAbsolute(requested)) {
    refuseOutput(requested, "absolute", "is absolute.");
  }
  const outputPath = resolve(cwd, requested);
  if (escapesWorkingDirectory(relative(cwd, outputPath))) {
    refuseOutput(requested, "outside-working-directory", "is not inside the working directory.");
  }
  const claimed = reserved.get(outputPath.toLowerCase());
  if (claimed !== undefined) {
    refuseOutput(requested, claimed.refusal, `is ${claimed.what}.`);
  }
  const name = basename(requested).toLowerCase();
  if (!TYPESCRIPT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    refuseOutput(
      requested,
      "not-typescript",
      `is not a TypeScript file (${TYPESCRIPT_EXTENSIONS.join(", ")}).`,
    );
  }
  return outputPath;
}

const ICU_MESSAGE_FORMATS: ReadonlySet<FormatId> = new Set(["next-intl-json", "arb"]);

function argumentsOf(entry: TranslationEntry, format: FormatId): MessageArguments {
  return ICU_MESSAGE_FORMATS.has(format)
    ? describeIcuMessageArguments(entry.value)
    : describeMessageArguments(entry.placeholders);
}

function declareMessage(
  key: string,
  entry: TranslationEntry,
  invalid: ReadonlySet<string>,
  format: FormatId,
): DeclaredMessage {
  const argumentsTaken = invalid.has(key)
    ? ({ style: "unresolved", reason: "invalid-message-syntax" } as const)
    : argumentsOf(entry, format);
  return { key, arguments: argumentsTaken, isPlural: entry.isPlural };
}

function takesKnownArguments(message: DeclaredMessage): boolean {
  return message.arguments.style === "named" || message.arguments.style === "positional";
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function unresolvedMessages(messages: readonly DeclaredMessage[]): readonly UnresolvedMessage[] {
  const unresolved: UnresolvedMessage[] = [];
  for (const message of messages) {
    if (message.arguments.style === "unresolved") {
      unresolved.push({ key: message.key, reason: message.arguments.reason });
    }
  }
  return unresolved;
}

const MIN_EXISTING_OUTPUT_BOUND = 16 * 1024 * 1024;

async function readExistingOutput(
  fs: SdkFs,
  path: string,
  compared: BoundedFileRead,
  declarationBytes: number,
): Promise<BoundedFileRead> {
  if (compared.kind !== "too-large") {
    return compared;
  }
  return fs.readFileBounded(path, Math.max(MIN_EXISTING_OUTPUT_BOUND, declarationBytes * 2));
}

async function refuseForeignOutput(
  fs: SdkFs,
  path: string,
  requested: string,
  compared: BoundedFileRead,
  declarationBytes: number,
): Promise<void> {
  const existing = await readExistingOutput(fs, path, compared, declarationBytes);
  if (existing.kind === "missing") {
    return;
  }
  if (existing.kind === "ok" && existing.content.startsWith(GENERATED_HEADER)) {
    return;
  }
  refuseOutput(
    requested,
    "not-generated-by-verbatra",
    `already holds a file that was not generated by verbatra: it does not begin with the "${GENERATED_HEADER.trim()}" header. It was left untouched.`,
  );
}

async function writeDeclaration(fs: SdkFs, path: string, declaration: string): Promise<void> {
  try {
    await fs.mkdir?.(dirname(path));
    await fs.writeFile(path, declaration);
  } catch (error) {
    throw new SdkError(
      "TYPES_UNWRITABLE",
      `The declaration file at ${path} could not be written: ${errorMessage(error)}`,
    );
  }
}

/**
 * Generates a TypeScript declaration for a project's source catalog: a union of every key it holds
 * and, per key, the arguments its message interpolates. A consumer that types its translation
 * function against it turns a misspelled key and a missing interpolation argument into compile
 * errors instead of runtime lookup failures.
 *
 * It reads one file (the source locale catalog) and writes one file (the declaration). It
 * constructs no provider, reads no API key and makes no network request, so it runs on a fresh
 * checkout before any key exists.
 *
 * The keys are exactly what the format adapter produced when reading the catalog, in document
 * order, so two runs over an unchanged catalog write byte-identical bytes. Arguments come from the
 * placeholder tokens the adapter extracted, except for the ICU message formats (`next-intl-json`
 * and `arb`): there each message is analysed with the same ICU parser the adapter uses, so an
 * argument that only some `select` or `plural` branches use is still declared, as optional. Keys are emitted as quoted string literals, so a key
 * carrying a dot, a reserved word, a leading digit, a quote, or nothing at all is declared
 * verbatim rather than dropped or re-split.
 *
 * What it will not claim is as important as what it will. A message whose placeholders name their
 * arguments gets an object shape; one whose placeholders are numbered or anonymous gets a readonly
 * tuple; one that takes nothing gets a shape that makes passing an argument a type error. A
 * message whose syntax the adapter reported as invalid, and one that appears to name and number
 * its arguments at once, are declared with {@link GenerateTypesResult.unresolved} recording why,
 * rather than being silently declared as taking nothing. Argument types come only from what the
 * catalog actually records: `number` where the format annotated one, and a `string | number` alias
 * everywhere else, never a permissive `any`. A name used with several types is declared as the
 * union of what each use accepts.
 *
 * With `check` set, nothing is written: the run reports whether the committed file still matches
 * what a fresh generation would produce, which is the shape a CI gate wants.
 *
 * @param input - The config, the output path, and whether to check rather than write.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns What was declared, and whether the file on disk matched.
 *
 * @example
 * ```ts
 * const result = await generateTypes({ config });
 * console.log(`${result.keys} keys declared in ${result.path}`);
 * ```
 *
 * @throws {@link SdkError} `TYPES_OUTPUT_CONFLICT`: the output path is refused (see
 * {@link GenerateTypesInput.out} for the full set), or a generating run found a file there that
 * does not begin with the header verbatra writes.
 * @throws {@link SdkError} `TYPES_UNWRITABLE`: the declaration file could not be written.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 */
export async function generateTypes(
  input: GenerateTypesInput,
  deps: GenerateTypesDeps = {},
): Promise<GenerateTypesResult> {
  const { config } = input;
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);
  const outputPath = resolveOutputPath(cwd, input.out, reservedPaths(cwd, input, resolver));

  const read = await readSourceResource(config, resolver, fs, adapter);
  const invalid = new Set(read.invalidIcuKeys);
  const messages = [...read.resource.entries].map(([key, entry]) =>
    declareMessage(key, entry, invalid, config.format),
  );
  const sourcePath = toPosix(relative(cwd, resolver.pathFor(config.sourceLocale)));
  const declaration = renderTypesDeclaration({ sourcePath, format: config.format, messages });

  const declarationBytes = Buffer.byteLength(declaration, "utf8");
  const onDisk = await fs.readFileBounded(outputPath, declarationBytes);
  const stale = !(onDisk.kind === "ok" && onDisk.content === declaration);
  const check = input.check === true;
  if (stale && !check) {
    const requested = input.out ?? DEFAULT_TYPES_PATH;
    await refuseForeignOutput(fs, outputPath, requested, onDisk, declarationBytes);
    await writeDeclaration(fs, outputPath, declaration);
  }
  return {
    path: outputPath,
    sourcePath,
    keys: messages.length,
    withArguments: messages.filter(takesKnownArguments).length,
    unresolved: unresolvedMessages(messages),
    excluded: read.excludedLeafPaths,
    plural: messages.filter((message) => message.isPlural).map((message) => message.key),
    written: stale && !check,
    stale,
    check,
  };
}
