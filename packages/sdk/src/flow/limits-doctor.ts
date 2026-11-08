import type { FormatAdapter } from "@verbatra/format-adapters";
import {
  LIMITS_FILE_NAME,
  limitsFilePath,
  limitsRemedy,
  readLimitsFile,
} from "../config/limits-file.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage } from "../errors.js";
import type { SdkFs } from "../fs.js";
import { type DoctorFinding, passFinding, warnFinding } from "./doctor-finding.js";
import { readSource } from "./source.js";

const LISTED_KEYS = 5;

function listed(keys: readonly string[]): string {
  const shown = keys
    .slice(0, LISTED_KEYS)
    .map((key) => JSON.stringify(key))
    .join(", ");
  return keys.length > LISTED_KEYS ? `${shown} and ${keys.length - LISTED_KEYS} more` : shown;
}

function countOf(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

async function sourceKeys(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
  adapter: FormatAdapter | undefined,
): Promise<ReadonlySet<string> | string> {
  if (adapter === undefined) {
    return "the format has no adapter";
  }
  try {
    return new Set((await readSource(config, cwd, fs, adapter)).resource.entries.keys());
  } catch (error) {
    return errorMessage(error);
  }
}

function shadowedProblem(keys: readonly string[], config: VerbatraConfig): string | undefined {
  const shadowed = keys.filter(
    (key) => config.maxLength !== undefined && Object.hasOwn(config.maxLength, key),
  );
  return shadowed.length === 0
    ? undefined
    : `${countOf(shadowed.length, "limit is", "limits are")} overridden by the config's maxLength: ${listed(shadowed)}.`;
}

function missingProblem(
  keys: readonly string[],
  present: ReadonlySet<string> | string,
): string | undefined {
  if (typeof present === "string") {
    return `Its keys were not checked against the source: ${present}.`;
  }
  const missing = keys.filter((key) => !present.has(key));
  return missing.length === 0
    ? undefined
    : `${countOf(missing.length, "key is", "keys are")} not in the source: ${listed(missing)}.`;
}

export async function describeLimits(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
  adapter: FormatAdapter | undefined,
): Promise<DoctorFinding> {
  const read = await readLimitsFile(limitsFilePath(cwd), fs);
  if (read.kind === "unusable") {
    return warnFinding(
      `${read.unusable.message}. Runs ignore it and hold values to the config's maxLength budgets only, and a limit cannot be set until it is fixed. ${limitsRemedy(read.unusable)}.`,
    );
  }
  if (read.limits.size === 0) {
    return passFinding(`${LIMITS_FILE_NAME} holds no limits.`);
  }
  const keys = [...read.limits.keys()].sort();
  const held = `${LIMITS_FILE_NAME} holds ${countOf(keys.length, "limit", "limits")}`;
  const problems = [
    shadowedProblem(keys, config),
    missingProblem(keys, await sourceKeys(config, cwd, fs, adapter)),
  ].filter((problem): problem is string => problem !== undefined);
  return problems.length === 0
    ? passFinding(`${held}, each for a key in the source.`)
    : warnFinding(`${held}. ${problems.join(" ")}`);
}
