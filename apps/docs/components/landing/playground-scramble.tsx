"use client";

import { type ReactNode, type Ref, type RefObject, useImperativeHandle, useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap-scramble";

export type ScrambleRow = { readonly lang: string; readonly from: string; readonly to: string };

export type ScrambleController = {
  play: (rows: ReadonlyArray<ScrambleRow>, done: () => void) => void;
  stop: () => void;
};

export const SCRAMBLE_STAGGER_S = 0.12;

export const SCRAMBLE_ROW_DURATION_S = 1;

export const SCRAMBLE_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

export const SCRAMBLE_SELECTOR = "[data-scramble]";

export const LATIN_SCRAMBLE_CHARS = "lowerCase";

const NON_LATIN_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function scrambleChars(text: string): string {
  if (!NON_LATIN_SCRIPT.test(text)) return LATIN_SCRAMBLE_CHARS;
  return [...new Set(text.replace(/\{[^}]*\}|\s/gu, ""))].join("");
}

type Run = {
  readonly targets: ReadonlyArray<HTMLElement>;
  readonly done: () => void;
  timeline: gsap.core.Timeline | null;
};

function scrambleTargets(scope: HTMLElement | null): HTMLElement[] {
  return scope === null ? [] : [...scope.querySelectorAll<HTMLElement>(SCRAMBLE_SELECTOR)];
}

function textNodeIn(element: HTMLElement, text: string): Text {
  const node = element.ownerDocument.createTextNode(text);
  element.replaceChildren(node);
  return node;
}

function scrambleTimeline(
  rows: ReadonlyArray<ScrambleRow>,
  targets: ReadonlyArray<HTMLElement>,
  onComplete: () => void,
): gsap.core.Timeline {
  const timeline = gsap.timeline({ onComplete });
  for (const [index, row] of rows.entries()) {
    const target = targets.find((element) => element.dataset.scramble === row.lang);
    if (target === undefined) continue;
    timeline.to(
      textNodeIn(target, row.from),
      {
        duration: SCRAMBLE_ROW_DURATION_S,
        ease: "none",
        scrambleText: { text: row.to, chars: scrambleChars(row.to) },
      },
      index * SCRAMBLE_STAGGER_S,
    );
  }
  return timeline;
}

export function Scrambler({
  scope,
  controller,
}: {
  scope: RefObject<HTMLElement | null>;
  controller: Ref<ScrambleController>;
}): ReactNode {
  const motion = useRef(false);
  const run = useRef<Run | null>(null);

  const stop = () => {
    const current = run.current;
    if (current === null) return;
    run.current = null;
    current.timeline?.kill();
    for (const target of current.targets) target.replaceChildren();
    current.done();
  };

  const play = (rows: ReadonlyArray<ScrambleRow>, done: () => void) => {
    stop();
    const current: Run = { targets: scrambleTargets(scope.current), done, timeline: null };
    run.current = current;
    if (!motion.current) {
      stop();
      return;
    }
    current.timeline = scrambleTimeline(rows, current.targets, stop);
  };

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(SCRAMBLE_MOTION_QUERY, () => {
        motion.current = true;
        return () => {
          motion.current = false;
          stop();
        };
      });
      return () => {
        media.revert();
        stop();
      };
    },
    { scope },
  );

  useImperativeHandle(controller, () => ({ play, stop }));

  return null;
}
