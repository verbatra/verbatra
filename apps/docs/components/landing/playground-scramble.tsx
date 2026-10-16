"use client";

import { type ReactNode, type Ref, type RefObject, useImperativeHandle, useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap-scramble";

export type ScrambleRow = { readonly lang: string; readonly from: string; readonly to: string };

export type ScrambleController = {
  play: (rows: ReadonlyArray<ScrambleRow>, done: () => void) => void;
};

export const SCRAMBLE_STAGGER_S = 0.12;

export const SCRAMBLE_ROW_DURATION_S = 1;

export const SCRAMBLE_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

export const SCRAMBLE_SELECTOR = "[data-scramble]";

const SCRAMBLE_CHARS = "lowerCase";

function scrambleTargets(scope: HTMLElement | null): HTMLElement[] {
  return scope === null ? [] : [...scope.querySelectorAll<HTMLElement>(SCRAMBLE_SELECTOR)];
}

export function Scrambler({
  scope,
  controller,
}: {
  scope: RefObject<HTMLElement | null>;
  controller: Ref<ScrambleController>;
}): ReactNode {
  const { contextSafe } = useGSAP({ scope });
  const media = useRef<gsap.MatchMedia | null>(null);

  useGSAP(() => () => media.current?.revert(), { scope });

  useImperativeHandle(
    controller,
    () => ({
      play: contextSafe((rows: ReadonlyArray<ScrambleRow>, done: () => void) => {
        media.current?.revert();
        const targets = scrambleTargets(scope.current);
        const mm = gsap.matchMedia(scope.current ?? undefined);
        media.current = mm;
        let animated = false;
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          for (const target of targets) target.textContent = "";
          done();
        };
        mm.add(SCRAMBLE_MOTION_QUERY, () => {
          animated = true;
          const timeline = gsap.timeline({ onComplete: settle });
          rows.forEach((row, index) => {
            const target = targets.find((element) => element.dataset.scramble === row.lang);
            if (target === undefined) return;
            target.textContent = row.from;
            timeline.to(
              target,
              {
                duration: SCRAMBLE_ROW_DURATION_S,
                ease: "none",
                scrambleText: { text: row.to, chars: SCRAMBLE_CHARS },
              },
              index * SCRAMBLE_STAGGER_S,
            );
          });
          return settle;
        });
        if (!animated) {
          mm.revert();
          settle();
        }
      }),
    }),
    [contextSafe, scope],
  );

  return null;
}
