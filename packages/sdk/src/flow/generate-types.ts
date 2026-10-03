import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { FormatId, TranslationEntry } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { type BoundedFileRead, defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { selectAdapter } from "../selection/select-adapter.js";
import {
  describeIcuMessageArguments,
  describeMessageArguments,
  type MessageArguments,
  type UnresolvedArgumentReason,
} from "./message-arguments.js";
import {
  asWrittenRefusal,
  createOutputPathGuard,
  namesNoFile,
  type OutputPathRefusal,
  outputRefusalReason,
  type ReservedPath,
  reservedProjectPaths,
} from "./reserved-output.js";
import { readSourceResource } from "./source.js";
import {
  type DeclaredMessage,
  GENERATED_HEADER,
  renderTypesDeclaration,
} from "./types-declaration.js";
import { pluralSuffixLookup } from "./unused-key-forms.js";
import { unwritableFileMessage } from "./write-target.js";

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
   * for its configuration, the {@link GenerateTypesInput.configPath} file, or the
   * {@link GenerateTypesInput.glossaryPath} file. When the file-system port implements `realpath`,
   * the same checks run again after symbolic links are resolved. Names are compared
   * case-insensitively. A generating run also refuses to replace an existing file there unless
   * that file begins with the header line verbatra writes, after any leading byte order mark and
   * blank lines, and refuses one too large to verify.
   */
  readonly out?: string;
  /**
   * The configuration file `config` was loaded from, absolute or relative to `cwd`. It is refused
   * as the output path even when its name is not one verbatra searches for.
   */
  readonly configPath?: string;
  /**
   * The glossary file the config names, absolute or relative to `cwd`, normally the `path` of a
   * file-backed {@link LoadedConfig.glossary}. It is refused as the output path.
   */
  readonly glossaryPath?: string;
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
  /**
   * Keys the adapter marked as carrying plural forms. Each sibling is declared on its own; for
   * `i18next-json` the base key a `count` lookup names (`item` for `item_one` and `item_other`)
   * is declared too, but is not listed here.
   */
  readonly plural: readonly string[];
  /**
   * Whether the declaration file was written. False in `check` mode, and false when the file on
   * disk already matched, so an unchanged catalog rewrites nothing.
   */
  readonly written: boolean;
  /** Whether the file on disk differed from the freshly generated declaration when the run started. */
  readonly stale: boolean;
  /**
   * Whether no declaration file existed at {@link GenerateTypesResult.path} when the run started.
   * A missing file is always {@link GenerateTypesResult.stale} too.
   */
  readonly missing: boolean;
  /** Whether this was a `check` run. */
  readonly check: boolean;
}

export const TYPES_OUTPUT_REFUSALS = [
  "names-no-file",
  "absolute",
  "outside-working-directory",
  "not-typescript",
  "locale-file",
  "lock-file",
  "provenance-file",
  "translation-memory-cache",
  "config-search-place",
  "loaded-config",
  "glossary-file",
  "unverified-existing-file",
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
  "provenance-file": RELATIVE_PATH_HINT,
  "translation-memory-cache": RELATIVE_PATH_HINT,
  "config-search-place": RELATIVE_PATH_HINT,
  "loaded-config": "Choose an output path other than the config file.",
  "glossary-file": "Choose an output path other than the glossary file.",
  "unverified-existing-file":
    "Pass a different --out path, or delete the file if it really is an old declaration.",
};

function refuseOutput(requested: string, refusal: TypesOutputRefusal, why: string): never {
  throw new SdkError(
    "TYPES_OUTPUT_CONFLICT",
    `The output path "${requested}" ${why} ${REFUSAL_HINTS[refusal]}`,
  );
}

function refuseGuardedOutput(requested: string, refusal: OutputPathRefusal): never {
  refuseOutput(
    requested,
    refusal.kind === "reserved" ? refusal.reserved.kind : "outside-working-directory",
    outputRefusalReason(refusal),
  );
}

const TYPESCRIPT_EXTENSIONS = [".ts", ".mts", ".cts"];

function resolveOutputPath(
  cwd: string,
  out: string | undefined,
  reserved: ReadonlyMap<string, ReservedPath>,
): string {
  const requested = out ?? DEFAULT_TYPES_PATH;
  if (namesNoFile(requested)) {
    refuseOutput(requested, "names-no-file", "names no file.");
  }
  if (isAbsolute(requested)) {
    refuseOutput(requested, "absolute", "is absolute.");
  }
  const outputPath = resolve(cwd, requested);
  const asWritten = asWrittenRefusal(cwd, outputPath, reserved);
  if (asWritten !== undefined) {
    refuseGuardedOutput(requested, asWritten);
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

async function refuseLinkedOutput(
  fs: SdkFs,
  cwd: string,
  outputPath: string,
  reserved: ReadonlyMap<string, ReservedPath>,
  requested: string,
): Promise<void> {
  const refusal = await createOutputPathGuard(fs, cwd, reserved).refusal(outputPath);
  if (refusal !== undefined) {
    refuseGuardedOutput(requested, refusal);
  }
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

const COUNT_PLACEHOLDER = "{{count}}";

function pluralLookupPlaceholders(
  entries: ReadonlyMap<string, TranslationEntry>,
  format: FormatId,
): ReadonlyMap<string, readonly string[]> {
  const byLookup = new Map<string, string[]>();
  for (const [key, entry] of entries) {
    const lookup = pluralSuffixLookup(format, key, entry.isPlural);
    if (lookup !== undefined && !entries.has(lookup)) {
      byLookup.set(lookup, [...(byLookup.get(lookup) ?? []), ...entry.placeholders]);
    }
  }
  return byLookup;
}

function withPluralLookupKeys(
  messages: readonly DeclaredMessage[],
  entries: ReadonlyMap<string, TranslationEntry>,
  format: FormatId,
): readonly DeclaredMessage[] {
  const placeholders = pluralLookupPlaceholders(entries, format);
  const declared = new Set<string>();
  return messages.flatMap((message) => {
    const lookup = pluralSuffixLookup(format, message.key, message.isPlural);
    const tokens = lookup === undefined ? undefined : placeholders.get(lookup);
    if (lookup === undefined || tokens === undefined || declared.has(lookup)) {
      return [message];
    }
    declared.add(lookup);
    const base: DeclaredMessage = {
      key: lookup,
      arguments: describeMessageArguments([...tokens, COUNT_PLACEHOLDER]),
      isPlural: false,
    };
    return [base, message];
  });
}

function declaredMessages(
  entries: ReadonlyMap<string, TranslationEntry>,
  invalid: ReadonlySet<string>,
  format: FormatId,
): readonly DeclaredMessage[] {
  const messages = [...entries].map(([key, entry]) => declareMessage(key, entry, invalid, format));
  return withPluralLookupKeys(messages, entries, format);
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

const LEADING_BOM_AND_BLANK_LINES = /^\uFEFF?(?:\r?\n)*/;

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
  if (existing.kind === "too-large") {
    refuseOutput(
      requested,
      "unverified-existing-file",
      "already holds a file too large to verify as one verbatra generated. It was left untouched.",
    );
  }
  if (existing.content.replace(LEADING_BOM_AND_BLANK_LINES, "").startsWith(GENERATED_HEADER)) {
    return;
  }
  refuseOutput(
    requested,
    "unverified-existing-file",
    `already holds a file that was not generated by verbatra: it does not begin with the "${GENERATED_HEADER.trim()}" header. It was left untouched.`,
  );
}

async function writeDeclaration(
  fs: SdkFs,
  path: string,
  cwd: string,
  declaration: string,
): Promise<void> {
  try {
    await fs.mkdir?.(dirname(path));
    await fs.writeFile(path, declaration);
  } catch (error) {
    throw new SdkError(
      "TYPES_UNWRITABLE",
      unwritableFileMessage("the declaration file", path, cwd, error),
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
 * argument that only some `select` or `plural` branches use is still declared, as optional. Keys
 * are emitted as quoted string literals, so a key carrying a dot, a reserved word, a leading digit,
 * a quote, or nothing at all is declared verbatim rather than dropped or re-split. For
 * `i18next-json`, a plural group also declares the base key that `t("item", { count })` looks up
 * (`item` for `item_one` and `item_other`, `place` for `place_ordinal_one`), requiring `count` and
 * every argument any of its forms takes, unless the catalog already holds that key.
 *
 * What it will not claim is as important as what it will. A message whose placeholders name their
 * arguments gets an object shape; one whose placeholders are numbered or anonymous gets a readonly
 * tuple; one that takes nothing gets a shape that makes passing an argument a type error. A
 * message whose syntax the adapter reported as invalid, one that mixes named, numbered and
 * anonymous arguments, and one that numbers an argument past the 64th are declared with
 * {@link GenerateTypesResult.unresolved} recording why, rather than being silently declared as
 * taking nothing. Argument types come only from what the catalog actually records: `number` for a
 * numeric annotation, printf conversion or ICU `plural`, `string` for a text conversion or ICU
 * `select`, `Date | number` for a date or time argument, and a `string | number` alias everywhere
 * else, never a permissive `any`. A name used with several types is declared as the union of what
 * each use accepts.
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
 * @throws {@link SdkError} `TYPES_UNWRITABLE`: the declaration file could not be written. The
 * message names the file relative to `cwd` and the underlying file-system code.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same
 * path.
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
  const reserved = reservedProjectPaths({
    cwd,
    config,
    resolver,
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
    ...(input.glossaryPath !== undefined ? { glossaryPath: input.glossaryPath } : {}),
  });
  const outputPath = resolveOutputPath(cwd, input.out, reserved);
  await refuseLinkedOutput(fs, cwd, outputPath, reserved, input.out ?? DEFAULT_TYPES_PATH);

  const read = await readSourceResource(config, resolver, fs, adapter);
  const invalid = new Set(read.invalidIcuKeys);
  const messages = declaredMessages(read.resource.entries, invalid, config.format);
  const sourcePath = toPosix(relative(cwd, resolver.pathFor(config.sourceLocale)));
  const declaration = renderTypesDeclaration({ sourcePath, format: config.format, messages });

  const declarationBytes = Buffer.byteLength(declaration, "utf8");
  const onDisk = await fs.readFileBounded(outputPath, declarationBytes);
  const stale = !(onDisk.kind === "ok" && onDisk.content === declaration);
  const check = input.check === true;
  if (stale && !check) {
    const requested = input.out ?? DEFAULT_TYPES_PATH;
    await refuseForeignOutput(fs, outputPath, requested, onDisk, declarationBytes);
    await writeDeclaration(fs, outputPath, cwd, declaration);
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
    missing: onDisk.kind === "missing",
    check,
  };
}
