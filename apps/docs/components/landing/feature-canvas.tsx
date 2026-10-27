"use client";

import { type ReactNode, useEffect, useRef } from "react";
import {
  canvasClock,
  type DrawContext,
  drawFeature,
  type Palette,
  readPalette,
  STILL_TIME,
} from "@/lib/landing-canvas";
import type { LandingFeatureId } from "@/lib/landing-features";
import { prefersReducedMotion, subscribeReducedMotion } from "@/lib/reduced-motion";

const FRAME_MS = 33;
const MAX_DPR = 2;
const MAX_STEP_SECONDS = 0.1;

type Surface = { width: number; height: number };

function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Surface {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function readCanvasPalette(canvas: HTMLCanvasElement): Palette {
  const style = getComputedStyle(canvas);
  return readPalette((token) => style.getPropertyValue(token));
}

function paint(
  id: LandingFeatureId,
  ctx: DrawContext & { clearRect: CanvasRenderingContext2D["clearRect"] },
  surface: Surface,
  time: number,
  palette: Palette,
): void {
  if (surface.width <= 0 || surface.height <= 0) return;
  ctx.clearRect(0, 0, surface.width, surface.height);
  drawFeature(id, ctx, surface.width, surface.height, time, palette);
}

export function FeatureCanvas({ id, phase }: { id: LandingFeatureId; phase: number }): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!canvas || !ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let surface = fitCanvas(canvas, ctx);
    let palette = readCanvasPalette(canvas);
    let reduced = prefersReducedMotion();
    let onscreen = typeof IntersectionObserver === "undefined";
    let finished = false;
    let played = 0;
    let raf = 0;
    let previous = 0;
    let last = 0;
    let lastTime = STILL_TIME[id];

    const running = (): boolean => !reduced && !finished && onscreen && !document.hidden;

    const draw = (time: number): void => {
      lastTime = time;
      paint(id, ctx, surface, time, palette);
    };

    const redraw = (): void => draw(reduced || finished ? STILL_TIME[id] : lastTime);

    const stop = (): void => {
      cancelAnimationFrame(raf);
      raf = 0;
      previous = 0;
    };

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      if (previous > 0) played += Math.min((now - previous) / 1000, MAX_STEP_SECONDS);
      previous = now;
      last = now;
      const clock = canvasClock(id, played, phase);
      draw(clock.time);
      if (!clock.done) return;
      finished = true;
      stop();
    };

    const sync = (): void => {
      if (running()) {
        if (raf === 0) raf = requestAnimationFrame(frame);
        return;
      }
      stop();
      redraw();
    };

    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            surface = fitCanvas(canvas, ctx);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            redraw();
          });
    resize?.observe(canvas);

    const visibility =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries.at(-1);
              if (!entry) return;
              onscreen = entry.isIntersecting;
              sync();
            },
            { rootMargin: "80px" },
          );
    visibility?.observe(canvas);

    const theme = new MutationObserver(() => {
      palette = readCanvasPalette(canvas);
      redraw();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const unsubscribe = subscribeReducedMotion((value) => {
      reduced = value;
      sync();
    });
    document.addEventListener("visibilitychange", sync);

    sync();

    return () => {
      stop();
      resize?.disconnect();
      visibility?.disconnect();
      theme.disconnect();
      unsubscribe();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [id, phase]);

  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabindex is not focusable
  return <canvas ref={ref} className="vk-feature-canvas" aria-hidden="true" data-feature={id} />;
}
