import { join } from "node:path";
import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { baseLoadedConfig, baseVerbatraConfig, makeContext, makeProject } from "../test-support.js";
import { projectDoctorTool } from "./project-doctor.js";

interface DoctorReport {
  readonly ok: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly status: string;
    readonly detail: string;
    readonly fix?: string;
  }[];
}

function reportOf(outcome: Awaited<ReturnType<typeof projectDoctorTool.execute>>): DoctorReport {
  if (outcome.kind !== "ok") {
    throw new Error(`expected a report, got ${outcome.kind}: ${outcome.message}`);
  }
  return outcome.result as DoctorReport;
}

describe("project.doctor", () => {
  it("runs every setup check against the config the call started with", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const context = makeContext({
      cwd: dir,
      config: baseLoadedConfig({
        config: baseVerbatraConfig({ provider: { id: "none", options: {} } }),
        source: { kind: "search", filepath: join(dir, "verbatra.config.json") },
      }),
    });

    const report = reportOf(await projectDoctorTool.execute({}, context));

    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.id)).toEqual([
      "config",
      "format-adapter",
      "provider",
      "api-key",
      "network-policy",
      "source-file",
      "plural-rules",
      "plural-completeness",
      "locale-codes",
      "locale-state",
    ]);
    expect(report.checks[0]?.detail).toBe("Loaded verbatra.config.json.");
    expect(report.checks[5]?.detail).toContain("locales/en.json");
    expect(report.checks[5]?.detail).not.toContain(dir);
  });

  it("reports a failed check with its fix, relative to the project", async () => {
    const dir = await makeProject({ greeting: "Hello" });
    const context = makeContext({
      cwd: dir,
      config: baseLoadedConfig({
        config: baseVerbatraConfig({ provider: { id: "none", options: {} }, sourceLocale: "fr" }),
      }),
    });

    const report = reportOf(await projectDoctorTool.execute({}, context));
    const source = report.checks.find((check) => check.id === "source-file");

    expect(report.ok).toBe(false);
    expect(source).toMatchObject({ status: "fail", fix: expect.stringContaining("files.pattern") });
    expect(source?.detail).toContain("locales/fr.json");
    expect(source?.detail).not.toContain(dir);
  });

  it("reports the load error as the failed config check when no config is loaded", async () => {
    const dir = await makeProject({ greeting: "Hello" });
    const outcome = await projectDoctorTool.executeUnconfigured?.(
      {},
      {
        cwd: dir,
        configError: new SdkError(
          "CONFIG_INVALID",
          `The verbatra configuration is invalid: ${join(dir, "glossary.json")} is missing`,
        ),
      },
    );

    const report = reportOf(outcome ?? { kind: "error", message: "no unconfigured handler" });

    expect(report.checks[0]).toMatchObject({
      id: "config",
      status: "fail",
      detail: "The verbatra configuration is invalid: glossary.json is missing",
      fix: expect.stringContaining("verbatra doctor"),
    });
  });
});
