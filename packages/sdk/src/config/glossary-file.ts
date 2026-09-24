import { SdkError } from "../errors.js";
import { selectLocales } from "../flow/select-locales.js";
import { unwritableFileMessage } from "../flow/write-target.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { glossaryGuardPath, withGlossaryGuard } from "../lock/locale-write-lock.js";
import { assertLocksHeld } from "../lock/lock-ownership.js";
import {
  describeGlossaryIssues,
  type Glossary,
  type GlossaryDefinition,
  type GlossaryInput,
  glossaryDefinitionSchema,
  normalizeGlossary,
  rawLocaleKeyIssues,
  type Version1Entries,
  version1Entries,
} from "./glossary.js";
import {
  applyEdit,
  applyVersion1Edit,
  assertValidEdit,
  type GlossaryEdit,
  isVersion1Edit,
  toDefinition,
} from "./glossary-edit.js";
import type { LoadedConfig } from "./load-config.js";
import type { GlossaryProvenance } from "./resolve-glossary.js";

export const MAX_GLOSSARY_FILE_BYTES = 1024 * 1024;

const DEFAULT_INDENT = "  ";

const INDENT_PATTERN = /^([ \t]+)"/m;

const BOM = "\uFEFF";
const REPLACEMENT_CHARACTER = "\uFFFD";
const NUL = "\u0000";

type GlossaryContent =
  | { readonly version: 1; readonly entries: Version1Entries }
  | { readonly version: 2; readonly definition: GlossaryDefinition };

interface GlossaryDocument {
  readonly content: GlossaryContent;
  readonly indent: string;
  readonly trailingNewline: string;
}

function stripBom(content: string): string {
  return content.startsWith(BOM) ? content.slice(BOM.length) : content;
}

function looksLikeInvalidEncoding(content: string): boolean {
  return content.startsWith(REPLACEMENT_CHARACTER) || content.includes(NUL);
}

function detectIndent(content: string): string {
  return INDENT_PATTERN.exec(content)?.[1] ?? DEFAULT_INDENT;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDefinition(
  parsed: Readonly<Record<string, unknown>>,
  path: string,
): GlossaryDefinition {
  const result = glossaryDefinitionSchema.safeParse(parsed);
  const issues = [...rawLocaleKeyIssues(parsed), ...(result.success ? [] : result.error.issues)];
  if (issues.length > 0) {
    throw new SdkError(
      "CONFIG_INVALID",
      `The glossary file at ${path} is not a valid version 2 glossary: ${describeGlossaryIssues(issues)}.`,
    );
  }
  return parsed as unknown as GlossaryDefinition;
}

function parseContent(parsed: unknown, path: string): GlossaryContent {
  if (isPlainObject(parsed) && typeof parsed.version === "number") {
    if (parsed.version !== 2) {
      throw new SdkError(
        "CONFIG_INVALID",
        `The glossary file at ${path} declares version ${parsed.version}, which this verbatra does not support. Supported versions are 1 (a flat term map) and 2.`,
      );
    }
    return { version: 2, definition: parseDefinition(parsed, path) };
  }
  const entries = version1Entries(parsed);
  if (entries === undefined) {
    throw new SdkError(
      "CONFIG_INVALID",
      `The glossary file at ${path} must contain a flat object of string keys to string values, or a version 2 glossary with "version": 2.`,
    );
  }
  return { version: 1, entries };
}

async function readGlossaryDocument(path: string, fs: SdkFs): Promise<GlossaryDocument> {
  const read = await fs.readFileBounded(path, MAX_GLOSSARY_FILE_BYTES);
  if (read.kind === "missing") {
    throw new SdkError(
      "CONFIG_INVALID",
      `The glossary file at ${path} was not found or could not be read.`,
    );
  }
  if (read.kind === "too-large") {
    throw new SdkError(
      "CONFIG_INVALID",
      `The glossary file at ${path} exceeds the maximum allowed size of ${MAX_GLOSSARY_FILE_BYTES} bytes.`,
    );
  }

  const content = stripBom(read.content);
  if (looksLikeInvalidEncoding(content)) {
    throw new SdkError("CONFIG_INVALID", `The glossary file at ${path} must be UTF-8 encoded.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new SdkError("CONFIG_INVALID", `The glossary file at ${path} is not valid JSON.`);
  }

  return {
    content: parseContent(parsed, path),
    indent: detectIndent(content),
    trailingNewline: content.endsWith("\n") ? "\n" : "",
  };
}

function inputOf(content: GlossaryContent): GlossaryInput {
  return content.version === 1 ? Object.fromEntries(content.entries) : content.definition;
}

export async function readGlossaryInput(path: string, fs: SdkFs): Promise<GlossaryInput> {
  return inputOf((await readGlossaryDocument(path, fs)).content);
}

function glossaryFilePath(glossary: GlossaryProvenance): string {
  if (glossary.source !== "file") {
    throw new SdkError(
      "GLOSSARY_NOT_FILE_BACKED",
      `The glossary is ${glossary.source === "inline" ? "written inline in the config" : "not configured"}, so there is no glossary file to work with. Point the config's glossary at a JSON file first.`,
    );
  }
  return glossary.path;
}

function editedContent(content: GlossaryContent, edit: GlossaryEdit): GlossaryContent {
  if (content.version === 1 && isVersion1Edit(edit)) {
    return {
      version: 1,
      entries: applyVersion1Edit(content.entries, edit.term, edit.translation ?? null),
    };
  }
  const definition = content.version === 1 ? toDefinition(content.entries) : content.definition;
  return { version: 2, definition: applyEdit(definition, edit) };
}

function serializeGlossary(
  content: GlossaryContent,
  document: GlossaryDocument,
  path: string,
): string {
  const serialized = `${JSON.stringify(inputOf(content), null, document.indent)}${document.trailingNewline}`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_GLOSSARY_FILE_BYTES) {
    throw new SdkError(
      "CONFIG_INVALID",
      `The updated glossary file at ${path} would exceed the maximum allowed size of ${MAX_GLOSSARY_FILE_BYTES} bytes.`,
    );
  }
  return serialized;
}

async function writeGlossary(path: string, serialized: string, fs: SdkFs): Promise<void> {
  await assertLocksHeld();
  try {
    await fs.writeFile(path, serialized);
  } catch (error) {
    throw new SdkError(
      "GLOSSARY_UNWRITABLE",
      `The glossary file at ${path} could not be written: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Input for {@link readGlossaryFile} and {@link updateGlossaryTerm}. */
export interface GlossaryFileInput {
  /**
   * Where the loaded config's glossary came from, as reported by {@link loadConfigWithMeta}. Only a
   * `file` provenance is accepted; it also carries the path, which is why neither function takes one.
   */
  readonly glossary: GlossaryProvenance;
}

/** Input for {@link updateGlossaryTerm}. */
export interface UpdateGlossaryTermInput extends GlossaryFileInput {
  /** Directory the write lock is taken under. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The source term to add, change, or remove. Must not be blank. */
  readonly term: string;
  /**
   * The translation to store for the term. Without `locale` it is the translation every target
   * locale uses; with `locale` it is that locale's own translation. `null` removes that translation
   * only, and the term goes with it once it has no translation and no forbidden rendering left.
   * Must not be blank.
   */
  readonly translation?: string | null;
  /** The target locale `translation` and `forbidden` apply to. Omit it for every locale. */
  readonly locale?: string;
  /**
   * Renderings `locale` must never use for the term, replacing any listed before. `null` or an
   * empty list removes them. Requires `locale`.
   */
  readonly forbidden?: readonly string[] | null;
  /** Free-text context for the term, or `null` to remove it. */
  readonly note?: string | null;
  /** The term's part of speech, free text, or `null` to remove it. */
  readonly partOfSpeech?: string | null;
  /** Whether the term is matched with case. */
  readonly caseSensitive?: boolean;
  /**
   * `true` adds the term to the terms kept untranslated in every locale, `false` removes it from
   * them. Cannot be combined with any field but `caseSensitive`.
   */
  readonly doNotTranslate?: boolean;
}

/** Injectable dependencies for {@link readGlossaryFile} and {@link updateGlossaryTerm}. */
export interface GlossaryFileDeps {
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/**
 * Reads a file-backed glossary fresh from disk, under the same validation {@link loadConfig} applies
 * when it resolves a glossary path. Use it when a long-running tool has to show the glossary as it
 * is now rather than as it was when the config was loaded.
 *
 * The file to read comes from the provenance itself, so there is no way to point this at a file the
 * loaded config does not name.
 *
 * @param input - The glossary provenance from a loaded config.
 * @param deps - Optional file-system override.
 * @returns The glossary in its normalized form, with the version it was written in.
 *
 * @throws {@link SdkError} `GLOSSARY_NOT_FILE_BACKED`: the config's glossary is inline or absent, so
 * there is no file to read.
 * @throws {@link SdkError} `CONFIG_INVALID`: the glossary file is missing, oversized, not UTF-8, not
 * valid JSON, neither a flat object of string keys to string values nor a valid version 2 glossary,
 * or declares a version other than 1 or 2.
 */
export async function readGlossaryFile(
  input: GlossaryFileInput,
  deps: GlossaryFileDeps = {},
): Promise<Glossary> {
  return normalizeGlossary(
    await readGlossaryInput(glossaryFilePath(input.glossary), deps.fs ?? defaultFs),
  );
}

/**
 * Adds, changes, or removes one term in a file-backed glossary, rewriting the JSON file in place.
 * This is the write path behind a glossary editor: one term changes and the rest of the file keeps
 * its order and its indentation.
 *
 * An edit sets any mix of a term's translation, for every locale or for one `locale`, its forbidden
 * renderings for a locale, its note, part of speech, and case sensitivity; or, with
 * `doNotTranslate`, adds a term to or removes it from the terms kept untranslated. A version 1 file
 * stays version 1 as long as the edit only sets or removes a translation for every locale. Any
 * other edit rewrites it as a version 2 glossary, keeping every existing term as a translation for
 * every locale. A term left with no translation and no forbidden rendering is removed.
 *
 * Only a file-backed glossary can be edited. An inline glossary lives inside the config module,
 * which is executable code this function will not rewrite, and no glossary at all has no file to
 * write to; both are refused rather than converted.
 *
 * The whole read-modify-write runs under a project-wide glossary lock, so two concurrent edits are
 * serialized rather than interleaved, and the file itself is replaced atomically. An edit that
 * leaves the glossary as it already is succeeds and writes nothing. The result is validated to stay
 * within the same size limit {@link loadConfig} enforces when it reads a glossary file back, so an
 * accepted write is always re-readable.
 *
 * @param input - The glossary provenance, the term, and what to change about it.
 * @param deps - Optional file-system override.
 * @returns The glossary as it now stands on disk, in its normalized form.
 *
 * @throws {@link SdkError} `GLOSSARY_NOT_FILE_BACKED`: the config's glossary is inline or absent, so
 * there is no file to write.
 * @throws {@link SdkError} `CONFIG_INVALID`: the term, its translation, a forbidden rendering, its
 * note, or its part of speech is blank; the edit sets no field, combines `doNotTranslate` with a
 * term field, gives forbidden renderings without a locale, names an invalid locale, or would leave
 * an invalid glossary, such as a new term with no translation or a term kept untranslated that is
 * also a glossary term; the glossary file on disk cannot be read as a glossary; or the updated
 * glossary would exceed the maximum glossary file size.
 * @throws {@link SdkError} `LOCK_CONTENDED`: the project's glossary write lock could not be acquired
 * before the timeout elapsed.
 * @throws {@link SdkError} `GLOSSARY_UNWRITABLE`: the glossary file could not be written, or the
 * project's glossary write lock could not be created, for instance because the project directory
 * is read-only, or could not be released after a successful edit, in which case the edit is saved.
 * The file-system error is the `cause`.
 *
 * @example
 * ```ts
 * import { loadConfigWithMeta, updateGlossaryTerm } from "@verbatra/sdk";
 *
 * const loaded = await loadConfigWithMeta({ cwd: process.cwd() });
 * const glossary = await updateGlossaryTerm({
 *   glossary: loaded.glossary,
 *   cwd: process.cwd(),
 *   term: "Verbatra",
 *   translation: "Verbatra",
 * });
 *
 * console.log(glossary.terms.length);
 * ```
 */
export async function updateGlossaryTerm(
  input: UpdateGlossaryTermInput,
  deps: GlossaryFileDeps = {},
): Promise<Glossary> {
  const path = glossaryFilePath(input.glossary);
  const { glossary: _provenance, cwd: inputCwd, ...edit } = input;
  assertValidEdit(edit);
  const fs = deps.fs ?? defaultFs;
  const cwd = inputCwd ?? process.cwd();

  let locked = false;
  let editFailure: { readonly error: unknown } | undefined;
  try {
    return await withGlossaryGuard(cwd, fs, async () => {
      locked = true;
      try {
        return await applyGlossaryEdit(path, edit, fs);
      } catch (error) {
        editFailure = { error };
        throw error;
      }
    });
  } catch (error) {
    throw glossaryGuardFailure(error, editFailure, locked, cwd);
  }
}

async function applyGlossaryEdit(path: string, edit: GlossaryEdit, fs: SdkFs): Promise<Glossary> {
  const document = await readGlossaryDocument(path, fs);
  const content = editedContent(document.content, edit);
  if (JSON.stringify(inputOf(content)) !== JSON.stringify(inputOf(document.content))) {
    await writeGlossary(path, serializeGlossary(content, document, path), fs);
  }
  return normalizeGlossary(inputOf(content));
}

function glossaryGuardFailure(
  error: unknown,
  editFailure: { readonly error: unknown } | undefined,
  locked: boolean,
  cwd: string,
): unknown {
  if (editFailure !== undefined) {
    return editFailure.error;
  }
  if (error instanceof SdkError) {
    return error;
  }
  const message = unwritableFileMessage(
    "the glossary write lock",
    glossaryGuardPath(cwd),
    cwd,
    error,
  );
  return new SdkError(
    "GLOSSARY_UNWRITABLE",
    locked
      ? `${message} The glossary edit was saved, but the lock could not be released and stays in place until a later run reclaims it after this process exits.`
      : message,
    { cause: error },
  );
}

/** The loaded config a glossary tool works on: the resolved config and its glossary provenance. */
export type GlossaryConfig = Pick<LoadedConfig, "config" | "glossary">;

/** Input for {@link readCurrentGlossary}. */
export interface ReadCurrentGlossaryInput {
  /** The loaded config, as {@link loadConfigWithMeta} returns it. */
  readonly loaded: GlossaryConfig;
}

/**
 * Reads the glossary a loaded config names as it is now: a file-backed glossary fresh from disk,
 * an inline one from the config itself, normalized either way. This is the read path behind a
 * glossary viewer that runs longer than one config load. To see what applies to one target locale,
 * pass the result to {@link glossaryForLocale}.
 *
 * @param input - The loaded config.
 * @param deps - Optional file-system override.
 * @returns The normalized glossary, or `undefined` when the config declares none.
 *
 * @throws {@link SdkError} `CONFIG_INVALID`: the glossary file cannot be read as a glossary.
 */
export async function readCurrentGlossary(
  input: ReadCurrentGlossaryInput,
  deps: GlossaryFileDeps = {},
): Promise<Glossary | undefined> {
  if (input.loaded.glossary.source === "file") {
    return readGlossaryFile({ glossary: input.loaded.glossary }, deps);
  }
  const inline = input.loaded.config.glossary;
  return inline === undefined ? undefined : normalizeGlossary(inline);
}

/** `T` with every field optional and accepting an explicit `undefined`. */
type OptionalFields<T> = { readonly [K in keyof T]?: T[K] | undefined };

/** Input for {@link editConfiguredGlossaryTerm}. */
export interface EditConfiguredGlossaryTermInput
  extends OptionalFields<Omit<UpdateGlossaryTermInput, "glossary" | "term">> {
  /** The loaded config, as {@link loadConfigWithMeta} returns it. */
  readonly loaded: GlossaryConfig;
  /** The source term to add, change, or remove. Must not be blank. */
  readonly term: string;
}

/**
 * {@link updateGlossaryTerm} for a tool that holds a loaded config: the same edit, with `locale`
 * checked against the config's target locales first and any field left `undefined` treated as
 * absent. MCP and Studio write the glossary through it.
 *
 * @param input - The loaded config, the term, and what to change about it.
 * @param deps - Optional file-system override.
 * @returns The glossary as it now stands on disk, in its normalized form.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: `locale` is not one of the configured target locales;
 * nothing is written.
 * @throws {@link SdkError} Every code {@link updateGlossaryTerm} throws.
 */
export async function editConfiguredGlossaryTerm(
  input: EditConfiguredGlossaryTermInput,
  deps: GlossaryFileDeps = {},
): Promise<Glossary> {
  const { loaded, ...edit } = input;
  if (edit.locale !== undefined) {
    selectLocales(loaded.config, [edit.locale]);
  }
  const defined = Object.fromEntries(
    Object.entries(edit).filter(([, value]) => value !== undefined),
  ) as Omit<UpdateGlossaryTermInput, "glossary">;
  return updateGlossaryTerm({ ...defined, glossary: loaded.glossary }, deps);
}
