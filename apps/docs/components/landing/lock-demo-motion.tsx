"use client";

import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import Button from "@/components/ui/button";

export type LockDemoStep = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly dwellMs: number;
};

export type LockDemoLabels = {
  readonly steps: string;
  readonly pause: string;
  readonly play: string;
};

const STAGE_QUERY = "(min-width: 64rem) and (prefers-reduced-motion: no-preference)";

const PROGRESS_ANIMATION = "vk-lock-progress";

const GLYPH = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "currentColor",
} as const;

function stageRetired(root: RefObject<HTMLElement | null>): boolean {
  const side = root.current?.querySelector(".vk-lock-side");
  return side !== null && side !== undefined && getComputedStyle(side).visibility === "hidden";
}

function useStage(root: RefObject<HTMLElement | null>): boolean {
  const [stage, setStage] = useState(false);
  useEffect(() => {
    if (stageRetired(root)) return;
    const query = window.matchMedia(STAGE_QUERY);
    const sync = () => setStage(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [root]);
  return stage;
}

function useInView(target: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const element = target.current;
    if (element === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? true),
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);
  return inView;
}

function showFrame(frame: HTMLElement, on: boolean): void {
  frame.toggleAttribute("data-active", on);
  frame.toggleAttribute("inert", !on);
  frame.setAttribute("aria-hidden", String(!on));
}

function resetFrame(frame: HTMLElement): void {
  frame.removeAttribute("data-active");
  frame.removeAttribute("inert");
  frame.removeAttribute("aria-hidden");
}

export function LockDemoMotion({
  steps,
  labels,
  children,
}: {
  steps: ReadonlyArray<LockDemoStep>;
  labels: LockDemoLabels;
  children: ReactNode;
}): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const stage = useStage(root);
  const inView = useInView(root);
  const [active, setActive] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const paused = userPaused || !inView;

  const count = steps.length;
  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    const advance = (event: AnimationEvent) => {
      if (event.animationName === PROGRESS_ANIMATION) {
        setActive((current) => (current + 1) % count);
      }
    };
    element.addEventListener("animationend", advance);
    return () => element.removeEventListener("animationend", advance);
  }, [count]);

  useEffect(() => {
    const frames = Array.from(root.current?.querySelectorAll<HTMLElement>(".vk-lock-frame") ?? []);
    frames.forEach((frame, index) => {
      if (stage) showFrame(frame, index === active);
      else resetFrame(frame);
    });
  }, [stage, active]);

  return (
    <div
      ref={root}
      className="vk-lock-stage"
      data-mode={stage ? "stage" : undefined}
      data-paused={paused ? "" : undefined}
      data-userpaused={userPaused ? "" : undefined}
    >
      <div className="vk-lock-side">
        <ol className="vk-lock-steps" aria-label={labels.steps}>
          {steps.map((step, index) => (
            <li key={step.id}>
              <button
                type="button"
                className="vk-lock-step"
                aria-controls={step.id}
                aria-current={index === active ? "step" : undefined}
                style={{ "--lock-dwell": `${step.dwellMs}ms` } as CSSProperties}
                onClick={() => {
                  setActive(index);
                  setUserPaused(true);
                }}
              >
                {index === active ? (
                  <span
                    className="vk-lock-prog"
                    aria-hidden="true"
                    style={{ animationPlayState: paused ? "paused" : "running" }}
                  />
                ) : null}
                <b>{step.label}</b>
                <span>{step.text}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="vk-lock-controls">
          <Button
            variant="ghost"
            size="md"
            className="vk-lock-pause"
            onClick={() => setUserPaused((current) => !current)}
          >
            <svg {...GLYPH} aria-hidden="true" className="vk-lock-glyph-pause">
              <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
            </svg>
            <svg {...GLYPH} aria-hidden="true" className="vk-lock-glyph-play">
              <path d="M8 5v14l11-7z" />
            </svg>
            {userPaused ? labels.play : labels.pause}
          </Button>
        </div>
      </div>
      <div className="vk-lock-frames">{children}</div>
    </div>
  );
}
