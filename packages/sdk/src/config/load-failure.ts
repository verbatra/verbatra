import { SdkError } from "../errors.js";
import { redact } from "../redact.js";

const TYPESCRIPT_LOADER_PREFIX = /^TypeScriptLoader failed to compile TypeScript:\s*/;

interface LoaderError {
  readonly name?: unknown;
  readonly message?: unknown;
  readonly filepath?: unknown;
  readonly mark?: { readonly line?: unknown; readonly column?: unknown };
}

function yamlPosition(mark: LoaderError["mark"]): string {
  if (typeof mark?.line !== "number" || typeof mark.column !== "number") {
    return "";
  }
  return ` at line ${mark.line + 1}, column ${mark.column + 1}`;
}

function firstLine(message: unknown): string {
  const text = typeof message === "string" ? message : String(message);
  const lines = text.replace(TYPESCRIPT_LOADER_PREFIX, "").split("\n");
  const line = lines.find((candidate) => candidate.trim().length > 0)?.trim() ?? "unknown error";
  return line.replace(/\.$/, "");
}

function describeCause(error: LoaderError): string {
  switch (error.name) {
    case "JSONError":
      return "the file is not valid JSON";
    case "YAMLException":
      return `the file is not valid YAML${yamlPosition(error.mark)}`;
    case "SyntaxError":
      return "the file has a syntax error";
    default:
      return firstLine(error.message);
  }
}

function describeFailure(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return `: ${firstLine(error)}`;
  }
  const loaderError = error as LoaderError;
  const location = typeof loaderError.filepath === "string" ? ` at ${loaderError.filepath}` : "";
  return `${location}: ${describeCause(loaderError)}`;
}

const WRAPPED_RESOLUTION_FAILURES: readonly (readonly [RegExp, string])[] = [
  [/^Cannot find (?:module|package) '/, "MODULE_NOT_FOUND"],
  [/^No "exports" main defined in /, "ERR_PACKAGE_PATH_NOT_EXPORTED"],
  [/^Package subpath '.*' is not defined by "exports" in /, "ERR_PACKAGE_PATH_NOT_EXPORTED"],
];

function hasStringCode(error: unknown): boolean {
  return error instanceof Error && typeof (error as { readonly code?: unknown }).code === "string";
}

function wrappedResolutionCause(error: unknown): Error | undefined {
  if (!(error instanceof Error) || !TYPESCRIPT_LOADER_PREFIX.test(error.message)) {
    return undefined;
  }
  const line = firstLine(error.message);
  const match = WRAPPED_RESOLUTION_FAILURES.find(([pattern]) => pattern.test(line));
  return match === undefined ? undefined : Object.assign(new Error(line), { code: match[1] });
}

function loaderCause(error: unknown): unknown {
  return hasStringCode(error) ? error : wrappedResolutionCause(error);
}

export function configLoadFailure(error: unknown): SdkError {
  const cause = loaderCause(error);
  return new SdkError(
    "CONFIG_INVALID",
    redact(`Failed to load the verbatra configuration${describeFailure(error)}.`),
    cause === undefined ? undefined : { cause },
  );
}
