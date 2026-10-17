import { resolveProjectRoot } from "@verbatra/sdk";
import type { McpProjectSession, McpProjectState } from "./project-session.js";

export interface TrackedProject {
  readonly project: McpProjectSession;
  root(): string;
}

function rootOf(state: McpProjectState, cwd: string): string {
  return state.kind === "configured" ? resolveProjectRoot(state.loaded.source, cwd) : cwd;
}

export function trackProjectRoot(
  session: McpProjectSession,
  cwd: string,
  onChange?: (root: string) => void,
): TrackedProject {
  let current = rootOf(session.latest(), cwd);
  return {
    root: () => current,
    project: {
      latest: () => session.latest(),
      current: async () => {
        const state = await session.current();
        const next = rootOf(state, cwd);
        if (state.kind === "configured" && next !== current) {
          current = next;
          onChange?.(next);
        }
        return state;
      },
    },
  };
}
