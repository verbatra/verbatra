import {
  type DoctorCheck,
  type DoctorResult,
  doctor,
  type LoadedConfig,
  projectRelativeMessage,
  redact,
} from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext, McpUnconfiguredContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

const doctorCheckSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["pass", "fail", "skipped"]),
  detail: z.string(),
  fix: z.string().optional(),
});

const projectDoctorResultSchema = z.object({
  ok: z.boolean(),
  checks: z.array(doctorCheckSchema).readonly(),
});

type ProjectDoctorResult = z.infer<typeof projectDoctorResultSchema>;

type DoctorContext = Omit<McpToolContext, "config">;

function presentText(text: string, cwd: string): string {
  return redact(projectRelativeMessage(text, cwd));
}

function presentCheck(check: DoctorCheck, cwd: string): ProjectDoctorResult["checks"][number] {
  const base = {
    id: check.id,
    title: check.title,
    status: check.status,
    detail: presentText(check.detail, cwd),
  };
  return check.fix === undefined ? base : { ...base, fix: presentText(check.fix, cwd) };
}

async function runDoctor(
  context: DoctorContext,
  loadConfig: () => Promise<LoadedConfig>,
): Promise<ProjectDoctorResult> {
  const result: DoctorResult = await doctor(
    { cwd: context.cwd },
    {
      loadConfig,
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
    },
  );
  return {
    ok: result.ok,
    checks: result.checks.map((check) => presentCheck(check, context.cwd)),
  };
}

async function projectDoctor(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<ProjectDoctorResult> {
  return runDoctor(context, async () => context.config);
}

async function unconfiguredProjectDoctor(
  _params: z.infer<typeof paramsSchema>,
  context: McpUnconfiguredContext,
): Promise<ProjectDoctorResult> {
  return runDoctor(context, async () => {
    throw context.configError;
  });
}

export const projectDoctorTool = defineTool({
  name: "project.doctor",
  description:
    "Checks the project setup and says how to fix what fails: whether the config loads and " +
    "validates, the format resolves to an adapter, the provider id is supported, the API key " +
    "environment variable is set (by name only; a value is never read or returned), the " +
    "network policy permits the provider's host, and the source locale file parses, plus " +
    "informational checks on plural rules, plural completeness, locale codes, and leftover " +
    "locale state. Each check has an id, a title, a status (pass, fail, or skipped), a detail, " +
    "and, on a failure, a fix: one imperative sentence naming the next step. ok is true only " +
    "when no check failed. Use it when project.snapshot reports configured: false, when any " +
    "tool fails with CONFIG_NOT_FOUND or CONFIG_INVALID, or before the first spend. It works " +
    "with or without a usable config; without one, the config check carries the load error " +
    "and the checks that need a config are skipped. Do not use it for translation status, " +
    "which status.check reports. Takes no parameters. Read-only: it calls no provider, makes " +
    "no network request, and writes nothing.",
  paramsSchema,
  outputSchema: projectDoctorResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: projectDoctor,
  unconfiguredHandler: unconfiguredProjectDoctor,
});
