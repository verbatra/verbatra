import { existsSync } from "node:fs";
import type { Environment, EnvironmentProbe } from "./guards.ts";

export const CONTAINER_MARKERS = ["/.dockerenv", "/run/.containerenv"] as const;

export interface ProcessLike {
  readonly env: Environment;
  readonly stdin: { readonly isTTY?: boolean };
  readonly stdout: { readonly isTTY?: boolean };
}

export function probeEnvironment(
  source: ProcessLike,
  exists: (path: string) => boolean = existsSync,
): EnvironmentProbe {
  return {
    env: source.env,
    isTTY: source.stdin.isTTY === true && source.stdout.isTTY === true,
    insideContainer: CONTAINER_MARKERS.some((marker) => exists(marker)),
  };
}
