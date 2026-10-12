"use client";

import { type ReactNode, useMemo, useState } from "react";
import { HERO_TERMINAL_SCRIPT } from "@/lib/hero-terminal";
import { Terminal } from "./terminal";

export const HERO_TERMINAL_TITLE = "~/app";

export const HERO_SETTLED_COMMANDS = 1;

const COMMANDS = HERO_TERMINAL_SCRIPT.map((step) => step.command);

export function heroTerminalOutputs(
  exitLines: ReadonlyArray<string>,
): Readonly<Record<number, ReadonlyArray<string>>> {
  return Object.fromEntries(
    HERO_TERMINAL_SCRIPT.map((step, index) => {
      const exit = exitLines[index];
      return [index, exit === undefined ? step.output : [...step.output, exit]];
    }),
  );
}

export function HeroTerminal({
  session,
  replay,
  exitLines,
}: {
  session: string;
  replay: string;
  exitLines: ReadonlyArray<string>;
}): ReactNode {
  const [run, setRun] = useState(0);
  const outputs = useMemo(() => heroTerminalOutputs(exitLines), [exitLines]);
  return (
    <Terminal
      key={run}
      commands={COMMANDS}
      outputs={outputs}
      title={HERO_TERMINAL_TITLE}
      sessionLabel={session}
      settledCommands={run === 0 ? HERO_SETTLED_COMMANDS : 0}
      loop={false}
      fitContent
      wrap
      pauseOffscreen
      className="vk-banner-terminal"
      headerAction={
        <button type="button" className="vk-banner-replay" onClick={() => setRun((n) => n + 1)}>
          {replay}
        </button>
      }
    />
  );
}
