"use client";

import { type ReactNode, useState } from "react";
import { HERO_EXIT_LINES, HERO_TERMINAL_SCRIPT } from "@/lib/hero-terminal";
import { Terminal } from "./terminal";

export const HERO_TERMINAL_TITLE = "~/app";

export const HERO_SETTLED_COMMANDS = 1;

const COMMANDS = HERO_TERMINAL_SCRIPT.map((step) => step.command);

export const HERO_TERMINAL_OUTPUTS: Readonly<Record<number, ReadonlyArray<string>>> =
  Object.fromEntries(
    HERO_TERMINAL_SCRIPT.map((step, index) => [index, [...step.output, HERO_EXIT_LINES[index]]]),
  );

export function HeroTerminal({ session, replay }: { session: string; replay: string }): ReactNode {
  const [run, setRun] = useState(0);
  return (
    <Terminal
      key={run}
      commands={COMMANDS}
      outputs={HERO_TERMINAL_OUTPUTS}
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
