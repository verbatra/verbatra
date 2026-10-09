"use client";

import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { howStepStates } from "@/lib/how-steps";
import { Terminal, type TerminalProgress, type TerminalProps } from "./terminal";

export type HowStepCopy = { key: string; title: string; body: string };

const IDLE: TerminalProgress = { lines: 0, typing: false };

export const HOW_PLAY_RATIO = 0.5;

function useBothInView(
  first: RefObject<Element | null>,
  second: RefObject<Element | null>,
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const a = first.current;
    const b = second.current;
    if (!a || !b || inView) return;
    const ratios = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
        if ((ratios.get(a) ?? 0) >= HOW_PLAY_RATIO && (ratios.get(b) ?? 0) >= HOW_PLAY_RATIO) {
          setInView(true);
        }
      },
      { threshold: [0, HOW_PLAY_RATIO, 1] },
    );
    observer.observe(a);
    observer.observe(b);
    return () => observer.disconnect();
  }, [first, second, inView]);

  return inView;
}

export function HowReplay({
  terminal,
  steps,
}: {
  terminal: Omit<TerminalProps, "onProgress" | "play">;
  steps: ReadonlyArray<HowStepCopy>;
}): ReactNode {
  const [progress, setProgress] = useState<TerminalProgress>(IDLE);
  const terminalRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);
  const play = useBothInView(terminalRef, stepsRef);
  const states = howStepStates(progress);

  return (
    <>
      <div ref={terminalRef} data-reveal="1" className="mt-[52px] min-w-0">
        <Terminal {...terminal} play={play} onProgress={setProgress} />
      </div>
      <ol
        ref={stepsRef}
        data-reveal="2"
        className="mt-5 grid list-none grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4"
      >
        {steps.map((step, index) => {
          const state = states[index] ?? "upcoming";
          return (
            <li
              key={step.key}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className="vk-how-step border-t border-fd-border pt-[18px]"
            >
              <h3 className="vk-h4">{step.title}</h3>
              <p className="mt-1.5 text-sm text-fd-muted-foreground">{step.body}</p>
            </li>
          );
        })}
      </ol>
    </>
  );
}
