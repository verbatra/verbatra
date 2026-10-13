"use client";

import { type ReactNode, useState } from "react";
import { HERO_EXIT_LINES, HERO_TERMINAL_SCRIPT, HERO_TERMINAL_TITLE } from "@/lib/hero-terminal";
import { Terminal } from "./terminal";

export const HERO_SETTLED_COMMANDS = 1;

const COMMANDS = HERO_TERMINAL_SCRIPT.map((step) => step.command);

export const HERO_TERMINAL_OUTPUTS: Readonly<Record<number, ReadonlyArray<string>>> =
  Object.fromEntries(
    HERO_TERMINAL_SCRIPT.map((step, index) => [index, [...step.output, HERO_EXIT_LINES[index]]]),
  );

export function HeroTerminal({
  session,
  replay,
  example,
}: {
  session: string;
  replay: string;
  example: string;
}): ReactNode {
  const [run, setRun] = useState(0);
  return (
    <Terminal
      key={run}
      commands={COMMANDS}
      outputs={HERO_TERMINAL_OUTPUTS}
      title={HERO_TERMINAL_TITLE}
      sessionLabel={session}
      settledCommands={run === 0 ? HERO_SETTLED_COMMANDS : 0}
      fitContent
      wrap
      pauseOffscreen
      className="vk-banner-terminal"
      headerAction={
        <span className="flex items-center gap-3">
          <span className="text-xs text-[color:var(--text-muted)]">{example}</span>
          <button type="button" className="vk-banner-replay" onClick={() => setRun((n) => n + 1)}>
            {replay}
          </button>
        </span>
      }
    />
  );
}
