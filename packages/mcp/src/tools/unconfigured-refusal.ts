import { errorHint } from "@verbatra/sdk";
import { describeErrorMessage } from "./define-tool.js";

const DOCTOR_POINTER =
  "Call project.doctor for every failing setup check and its fix; the server loads the config on " +
  "the next call once it is valid, without a restart.";

export function describeUnconfiguredRefusal(toolName: string, error: unknown, cwd: string): string {
  const hint = errorHint(error);
  const nextStep = hint === undefined ? DOCTOR_POINTER : `${hint} ${DOCTOR_POINTER}`;
  return [
    describeErrorMessage(error, cwd),
    `${toolName} needs a usable project config, and this server has none.`,
    `Next step: ${nextStep}`,
  ].join("\n");
}
