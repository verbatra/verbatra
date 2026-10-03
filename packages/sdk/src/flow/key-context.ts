import type { GlossaryDraftCheck, LocaleGlossary } from "@verbatra/ai-providers";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { type Glossary, redactGlossary } from "../config/glossary.js";
import { type GlossaryConfig, readCurrentGlossary } from "../config/glossary-file.js";
import { glossaryDraftCheck, glossaryHits } from "../config/glossary-hits.js";
import type { SdkFs } from "../fs.js";
import { redact } from "../redact.js";
import { type KeyValueResult, keyValue } from "./key-value.js";

/** Input for {@link keyContext}. */
export interface KeyContextInput {
  /** The loaded config, as {@link loadConfigWithMeta} returns it, so a file-backed glossary is read. */
  readonly loaded: GlossaryConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The target locale the key is about to be written in. Must be a configured target locale. */
  readonly locale: string;
  /** The key to read. Must exist in the source resource. */
  readonly key: string;
  /** A value the caller intends to write, checked against the applying glossary terms when given. */
  readonly draft?: string;
}

/** Injectable dependencies for {@link keyContext}. Every field has a working default. */
export interface KeyContextDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** Why the glossary part of a {@link KeyContext} is empty although the config declares a glossary. */
export interface KeyContextGlossaryNotice {
  /** The error code of the failed glossary read, such as `CONFIG_INVALID`. */
  readonly code: string;
  /** The error message, passed through secret redaction. */
  readonly message: string;
}

/** What a translator needs to write one key in one target locale, as returned by {@link keyContext}. */
export interface KeyContext extends KeyValueResult {
  /** The glossary terms whose source occurs in the source text, as that locale is held to them. */
  readonly glossary: LocaleGlossary;
  /** The key's configured `maxLength` budget in characters, absent when the config sets none. */
  readonly maxLength?: number;
  /** How the input's `draft` uses the applying terms, absent when no draft was given. */
  readonly draftCheck?: GlossaryDraftCheck;
  /** Present when the glossary could not be read; the glossary part is then empty. */
  readonly glossaryNotice?: KeyContextGlossaryNotice;
}

interface GlossaryRead {
  readonly glossary: Glossary | undefined;
  readonly notice?: KeyContextGlossaryNotice;
}

function codeOf(error: unknown): string {
  const code = (error as { readonly code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "GLOSSARY_UNREADABLE";
}

async function readGlossaryLeniently(
  loaded: GlossaryConfig,
  fs: SdkFs | undefined,
): Promise<GlossaryRead> {
  try {
    const glossary = await readCurrentGlossary({ loaded }, fs !== undefined ? { fs } : {});
    return { glossary: glossary === undefined ? undefined : redactGlossary(glossary).glossary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { glossary: undefined, notice: { code: codeOf(error), message: redact(message) } };
  }
}

/**
 * Reads what a translator needs to write one key in one target locale: the key's current source
 * and target text with provenance and description (as {@link keyValue} reports them), the glossary
 * terms that apply to the source text, the key's `maxLength` budget, and, when a draft is given,
 * how that draft uses the applying terms. It writes nothing and calls no provider.
 *
 * Glossary values pass through secret redaction before they are matched. A glossary that cannot be
 * read does not fail the call: the glossary part comes back empty with a `glossaryNotice` naming
 * the error, while the source, target and provenance are still answered.
 *
 * Like every glossary-aware entry point, it takes the `loaded` result of
 * {@link loadConfigWithMeta} rather than a bare config, because it reads a file-backed glossary
 * again from disk, so an edit to that file is picked up without loading the config again.
 *
 * @param input - The loaded config, the locale and key, and an optional draft.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The key's values, the applying glossary terms, its budget, and the draft check.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is not present in the source resource.
 *
 * @example
 * ```ts
 * const loaded = await loadConfigWithMeta();
 * const context = await keyContext({ loaded, locale: "de", key: "cart.title", draft: "Warenkorb" });
 * for (const term of context.draftCheck?.terms ?? []) {
 *   if (term.targetUsed === false) console.log(`${term.source} should be ${term.target}`);
 * }
 * ```
 */
export async function keyContext(
  input: KeyContextInput,
  deps: KeyContextDeps = {},
): Promise<KeyContext> {
  const config = input.loaded.config;
  const [value, glossaryRead] = await Promise.all([
    keyValue(
      {
        config,
        ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
        locale: input.locale,
        key: input.key,
      },
      deps,
    ),
    readGlossaryLeniently(input.loaded, deps.fs),
  ]);
  const glossary = glossaryRead.glossary;
  const maxLength = config.maxLength?.[input.key];
  return {
    ...value,
    glossary: glossaryHits({
      glossary,
      locale: input.locale,
      sourceLocale: config.sourceLocale,
      source: value.source,
    }),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(glossaryRead.notice !== undefined ? { glossaryNotice: glossaryRead.notice } : {}),
    ...(input.draft !== undefined
      ? {
          draftCheck: glossaryDraftCheck({
            glossary,
            locale: input.locale,
            sourceLocale: config.sourceLocale,
            source: value.source,
            draft: input.draft,
          }),
        }
      : {}),
  };
}
