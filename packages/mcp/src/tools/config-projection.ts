import { relative } from "node:path";
import { type GlossaryProvenance, type LoadedConfig, redact } from "@verbatra/sdk";

export function resolveConfigSource(source: LoadedConfig["source"], cwd: string): string {
  if (source.kind === "override") {
    return "override";
  }
  return redact(relative(cwd, source.filepath));
}

export function resolveGlossaryProvenance(
  glossary: LoadedConfig["glossary"],
  cwd: string,
): GlossaryProvenance {
  if (glossary.source === "file") {
    return { source: "file", path: redact(relative(cwd, glossary.path)) };
  }
  return { source: glossary.source };
}
