import { createRequire } from "node:module";
import { loadSdkModule } from "../lazy-sdk.js";

interface LevelSettableLogger {
  setLevel(level: "silent"): void;
}
interface LoglevelInstance {
  getLogger(name: string): LevelSettableLogger;
}

const DEEPL_LOGGER = "deepl";

export function resolveDeeplLoglevel(
  requireFn: NodeRequire = createRequire(import.meta.url),
): LoglevelInstance | undefined {
  try {
    const entry = requireFn.resolve("deepl-node");
    return createRequire(entry)("loglevel") as LoglevelInstance;
  } catch {
    return undefined;
  }
}

export function silenceDeeplLogger(instances: readonly (LoglevelInstance | undefined)[]): void {
  for (const instance of instances) {
    instance?.getLogger(DEEPL_LOGGER).setLevel("silent");
  }
}

export async function silenceSdkLogging(): Promise<void> {
  const { default: log } = await loadSdkModule("loglevel", () => import("loglevel"));
  silenceDeeplLogger([log, resolveDeeplLoglevel()]);
}
