import type { StructuredError } from "./state.js";

const REACHABLE_CODE_COPY: Readonly<Record<string, string>> = {
  REQUEST_INVALID:
    "The request body was not shaped as the server expects. Reload the page and try again.",
  METHOD_UNKNOWN:
    "This action is not recognized by the running Studio server. Make sure the CLI and Studio versions match.",
  PARAMS_INVALID: "The request parameters failed validation. Reload the page and try again.",
  METHOD_RATE_LIMITED:
    "Studio is limiting how often this action can run. Wait a moment and try again.",
  INTERNAL: "An unexpected server error occurred. Check the terminal running Studio for details.",
  SESSION_EXPIRED: "The session has expired. Reload the page to start a new one.",
  UNKNOWN_FORMAT:
    "No adapter is registered for this project's configured format. Check the format field in the verbatra config.",
  SOURCE_UNREADABLE: "The source locale file could not be found on disk.",
  SOURCE_INVALID: "The source locale file could not be read or parsed for the configured format.",
  LOCK_FILE_INVALID: "The lock file is missing, corrupt, or at an unsupported version.",
  PROVENANCE_FILE_INVALID:
    "verbatra.provenance.json is corrupt, oversized, or not shaped as verbatra expects, so nothing was written. Restore it from version control and try again.",
  PROVENANCE_FILE_UNWRITABLE:
    "The decision was not saved: verbatra.provenance.json was written by a newer verbatra, or saving the decision would make it too large. Nothing was changed.",
  REVIEW_VALUE_CHANGED:
    "This translation changed since the queue was loaded, so nothing was saved. Look at the current value and decide again.",
  REVIEW_SOURCE_CHANGED:
    "The source text changed since this translation was written, so it cannot be approved as it stands. Edit it to confirm it against the new source.",
  REVIEW_RESTORE_FAILED:
    "The rejection failed partway and the files could not be put back. Restore the locale file and verbatra.provenance.json from version control.",
  REVIEW_REJECT_UNSUPPORTED:
    "This project's file format cannot drop a single translation, so the file was left as it was. Edit the translation instead.",
  UNKNOWN_LOCALE: "The requested locale is not among this project's configured target locales.",
  UNKNOWN_KEY: "The requested key was not found in the source resource. It may have been removed.",
  LOCK_CONTENDED:
    "This locale's write lock is held by another process. Wait a moment and try again.",
  GLOSSARY_NOT_FILE_BACKED:
    "This project's glossary is written inline in the config, or not configured at all, so Studio cannot change it. Move it into a JSON file the config points at.",
  GLOSSARY_UNWRITABLE:
    "The glossary file could not be written. Check that it still exists and that it is writable.",
  LOCALE_LAYOUT_INVALID:
    "The files pattern and locale style in the verbatra config cannot produce a path for every configured locale. Check the files section of the config.",
  LOCALE_PATH_COLLISION:
    "Two configured locales resolve to the same file path. Check the locales and the files pattern in the verbatra config.",
  INVALID_JSON: "A target locale file is not valid JSON.",
  INVALID_YAML: "A target locale file is not valid YAML.",
  INVALID_XML: "A target locale file is not valid XML.",
  INVALID_STRUCTURE: "A target locale file has a structure that is not valid for its format.",
  MAX_DEPTH_EXCEEDED: "A target locale file is nested deeper than the supported limit.",
  INPUT_TOO_LARGE: "A target locale file exceeds the supported size limit.",
  MIXED_STRUCTURE:
    "A target locale file mixes flat and nested keys, which this format does not support.",
};

const PROVIDER_CODE_COPY: Readonly<Record<string, string>> = {
  RATE_LIMITED: "The translation provider is rate-limiting requests. Wait a moment and try again.",
  AUTH_FAILED: "The translation provider rejected the configured API key.",
  TIMEOUT: "The translation provider did not respond in time. Try again.",
  PROVIDER_UNAVAILABLE:
    "The translation provider is currently unavailable. This is an outage on their side, so try again later.",
};

export const ERROR_CODE_COPY: Readonly<Record<string, string>> = {
  ...REACHABLE_CODE_COPY,
  ...PROVIDER_CODE_COPY,
};

export function copyForErrorCode(code: string): string | undefined {
  return Object.hasOwn(ERROR_CODE_COPY, code) ? ERROR_CODE_COPY[code] : undefined;
}

export function resolveErrorCopy(error: StructuredError): string {
  return copyForErrorCode(error.code) ?? error.message;
}
