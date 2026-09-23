import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { withGlossaryGuard } from "../lock/locale-write-lock.js";
import {
  describeGlossaryIssues,
  type Glossary,
  type GlossaryDefinition,
  type GlossaryInput,
  glossaryDefinitionSchema,
  normalizeGlossary,
} from "./glossary.js";
import {
  applyEdit,
  applyVersion1Edit,
  assertValidEdit,
  type GlossaryEdit,
  isVersion1Edit,
  toDefinition,
  type Version1Entries,
} from "./glossary-edit.js";
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

function version1Entries(parsed: Readonly<Record<string, unknown>>): Version1Entries | undefined {
  const entries: (readonly [string, string])[] = [];
  for (const [term, translation] of Object.entries(parsed)) {
    if (typeof translation !== "string") {
      return undefined;
    }
    entries.push([term, translation]);
  }
  return entries;
}

function parseDefinition(parsed: unknown, path: string): GlossaryDefinition {
  const result = glossaryDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    throw new SdkError(
      "CONFIG_INVALID",
      `The glossary file at ${path} is not a valid version 2 glossary: ${describeGlossaryIssues(result.error.issues)}.`,
    );
  }
  return result.data;
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
  const entries = isPlainObject(parsed) ? version1Entries(parsed) : undefined;
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
  try {
    await fs.writeFile(path, serialized);
  } catch (error) {
    throw new SdkError(
      "GLOSSARY_UNWRITABLE",
      `The glossary file at ${path} could not be written: ${error instanceof Error ? error.message : String(error)}`,
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
 * serialized rather than interleaved, and the file itself is replaced atomically. The result is
 * validated to stay within the same size limit {@link loadConfig} enforces when it reads a glossary
 * file back, so an accepted write is always re-readable.
 *
 * @param input - The glossary provenance, the term, and what to change about it.
 * @param deps - Optional file-system override.
 * @returns The glossary as it now stands on disk, in its normalized form.
 *
 * @throws {@link SdkError} `GLOSSARY_NOT_FILE_BACKED`: the config's glossary is inline or absent, so
 * there is no file to write.
 * @throws {@link SdkError} `CONFIG_INVALID`: the term, its translation, a forbidden rendering, its
 * note, or its part of speech is blank; the edit changes nothing, combines `doNotTranslate` with a
 * term field, gives forbidden renderings without a locale, names an invalid locale, or would leave
 * an invalid glossary, such as a new term with no translation or a term kept untranslated that is
 * also a glossary term; the glossary file on disk cannot be read as a glossary; or the updated
 * glossary would exceed the maximum glossary file size.
 * @throws {@link SdkError} `LOCK_CONTENDED`: the project's glossary write lock could not be acquired
 * before the timeout elapsed.
 * @throws {@link SdkError} `GLOSSARY_UNWRITABLE`: the glossary file could not be written.
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

  return withGlossaryGuard(cwd, fs, async () => {
    const document = await readGlossaryDocument(path, fs);
    const content = editedContent(document.content, edit);
    await writeGlossary(path, serializeGlossary(content, document, path), fs);
    return normalizeGlossary(inputOf(content));
  });
}
