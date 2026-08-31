import { relative } from "node:path";
import { type LoadedConfig, redact } from "@verbatra/sdk";
import type { GlossaryIndicator } from "../shared/rpc/glossary.js";
import type { ProjectSnapshotResult, StudioCapabilities } from "../shared/rpc/snapshot.js";

function projectConfigSource(source: LoadedConfig["source"], projectRoot: string): string {
  if (source.kind === "override") {
    return "override";
  }
  return redact(relative(projectRoot, source.filepath));
}

export function projectGlossaryIndicator(
  glossary: LoadedConfig["glossary"],
  projectRoot: string,
): GlossaryIndicator {
  if (glossary.source === "file") {
    return { source: "file", path: redact(relative(projectRoot, glossary.path)) };
  }
  return { source: glossary.source };
}

export function buildProjectSnapshot(
  loaded: LoadedConfig,
  projectRoot: string,
  capabilities: StudioCapabilities,
  exposeAgentTools: boolean,
): ProjectSnapshotResult {
  const { config } = loaded;
  return {
    sourceLocale: redact(config.sourceLocale),
    targetLocales: config.targetLocales.map((locale) => redact(locale)),
    format: config.format,
    files: { pattern: redact(config.files.pattern) },
    provider: { id: config.provider.id },
    configSource: projectConfigSource(loaded.source, projectRoot),
    glossary: projectGlossaryIndicator(loaded.glossary, projectRoot),
    capabilities,
    exposeAgentTools,
    ...(config.prune !== undefined ? { prune: config.prune } : {}),
    ...(config.generatePlurals !== undefined ? { generatePlurals: config.generatePlurals } : {}),
    ...(config.maxBatchSize !== undefined ? { maxBatchSize: config.maxBatchSize } : {}),
    ...(config.tone !== undefined ? { tone: config.tone } : {}),
  };
}
