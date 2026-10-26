import type { LandingFeatureId } from "@/lib/landing-features";
import { clamp } from "@/lib/playground-cycle";

export type Palette = {
  readonly accent: string;
  readonly dim: string;
  readonly muted: string;
  readonly border: string;
  readonly card: string;
  readonly fg: string;
  readonly warn: string;
  readonly bad: string;
  readonly bg: string;
};

export type DrawContext = Pick<
  CanvasRenderingContext2D,
  | "arc"
  | "arcTo"
  | "beginPath"
  | "closePath"
  | "fill"
  | "fillRect"
  | "fillStyle"
  | "globalAlpha"
  | "lineTo"
  | "lineWidth"
  | "moveTo"
  | "restore"
  | "save"
  | "setLineDash"
  | "stroke"
  | "strokeStyle"
>;

type FrameFunction = (c: DrawContext, w: number, h: number, t: number, p: Palette) => void;

const PALETTE_TOKENS: Readonly<Record<keyof Palette, string>> = {
  accent: "--accent",
  dim: "--art-dim",
  muted: "--text-muted",
  border: "--border-default",
  card: "--surface-card",
  fg: "--text-strong",
  warn: "--v-status-changed",
  bad: "--v-danger",
  bg: "--surface-bg",
};

export function readPalette(read: (token: string) => string): Palette {
  const value = (key: keyof Palette): string => read(PALETTE_TOKENS[key]).trim();
  return {
    accent: value("accent"),
    dim: value("dim"),
    muted: value("muted"),
    border: value("border"),
    card: value("card"),
    fg: value("fg"),
    warn: value("warn"),
    bad: value("bad"),
    bg: value("bg"),
  };
}

const TAU = Math.PI * 2;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function roundRect(
  c: DrawContext,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fillRound(
  c: DrawContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  alpha: number,
): void {
  c.globalAlpha = alpha;
  c.fillStyle = color;
  roundRect(c, x, y, w, h, r);
  c.fill();
}

function strokeRound(
  c: DrawContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  width: number,
  alpha: number,
): void {
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = width;
  roundRect(c, x, y, w, h, r);
  c.stroke();
}

function line(c: DrawContext, x1: number, y1: number, x2: number, y2: number): void {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function circle(c: DrawContext, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

function lock(c: DrawContext, x: number, y: number, s: number, color: string, alpha: number): void {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1.4;
  c.beginPath();
  c.arc(x, y - s * 0.35, s * 0.38, Math.PI, 0);
  c.stroke();
  roundRect(c, x - s * 0.55, y - s * 0.3, s * 1.1, s * 0.85, 2);
  c.fill();
  c.restore();
}

type CellState = "done" | "review" | "pending";

function cellState(v: number, index: number, cursor: number): CellState {
  if (v < 0.2) return cursor === -1 || index < cursor ? "done" : "review";
  return v < 0.27 ? "pending" : "done";
}

function cellPop(v: number, index: number, cursor: number): number {
  const behind = cursor - index;
  return cursor !== -1 && v < 0.2 && behind > 0 && behind < 4 ? (4 - behind) / 4 : 0;
}

function studioCell(
  c: DrawContext,
  p: Palette,
  x: number,
  y: number,
  size: number,
  state: CellState,
  pop: number,
): void {
  if (state === "done") {
    fillRound(
      c,
      x - pop * 1.5,
      y - pop * 1.5,
      size + pop * 3,
      size + pop * 3,
      4,
      p.accent,
      0.5 + pop * 0.4,
    );
    return;
  }
  if (state === "review") {
    fillRound(c, x, y, size, size, 4, p.warn, 0.95);
    return;
  }
  strokeRound(c, x + 0.6, y + 0.6, size - 1.2, size - 1.2, 4, p.dim, 1.2, 0.55);
}

type StudioCursor = {
  readonly x: number;
  readonly y: number;
  readonly index: number;
  review: boolean;
};

function studioPopover(
  c: DrawContext,
  p: Palette,
  w: number,
  h: number,
  t: number,
  cursor: StudioCursor,
  size: number,
): void {
  strokeRound(c, cursor.x - 3, cursor.y - 3, size + 6, size + 6, 6, p.fg, 1.6, 1);
  const pw = 92;
  const ph = 34;
  const px = Math.min(cursor.x + 16, w - pw - 10);
  const py = cursor.y + size + 10 > h - ph - 8 ? cursor.y - ph - 8 : cursor.y + size + 10;
  fillRound(c, px, py, pw, ph, 8, p.card, 0.98);
  strokeRound(c, px + 0.5, py + 0.5, pw - 1, ph - 1, 8, p.border, 1, 1);
  fillRound(c, px + 10, py + 9, 46 + hash(cursor.index, 2) * 20, 4, 2, p.muted, 0.8);
  fillRound(c, px + 10, py + 19, 30, 4, 2, cursor.review ? p.warn : p.accent, 0.9);
  if (Math.floor(t * 2) % 2 === 0) {
    c.fillStyle = p.fg;
    c.globalAlpha = 1;
    c.fillRect(px + 44, py + 17, 1.5, 9);
  }
}

const studio: FrameFunction = (c, w, h, t, p) => {
  const pad = 22;
  const gap = 7;
  const size = 13;
  const head = 54;
  const cols = Math.max(6, Math.floor((w - pad * 2 - head) / (size + gap)));
  const rows = Math.min(6, Math.max(3, Math.floor((h - pad * 2) / (size + gap))));
  const gridW = cols * (size + gap) - gap;
  const gridH = rows * (size + gap) - gap;
  const x0 = (w - gridW - head) / 2 + head;
  const y0 = (h - gridH) / 2;
  const total = cols * rows;
  const step = Math.floor(t * 6) % (total + 12);
  const current = step < total ? step : -1;
  let cursor: StudioCursor | null = null;
  for (let r = 0; r < rows; r += 1) {
    const rowY = y0 + r * (size + gap);
    fillRound(c, x0 - head + 6, rowY + size / 2 - 1.5, 10 + hash(r, 3) * 24, 3, 1.5, p.dim, 0.55);
    for (let k = 0; k < cols; k += 1) {
      const index = r * cols + k;
      const v = hash(r + 1, k + 7);
      const x = x0 + k * (size + gap);
      studioCell(c, p, x, rowY, size, cellState(v, index, current), cellPop(v, index, current));
      if (index === current) cursor = { x, y: rowY, index, review: v < 0.2 };
    }
  }
  if (cursor) studioPopover(c, p, w, h, t, cursor, size);
  c.globalAlpha = 1;
};

function handoffSheet(
  c: DrawContext,
  p: Palette,
  x: number,
  y: number,
  w: number,
  rowHeight: number,
  litRows: number,
): void {
  const height = rowHeight * 4;
  strokeRound(c, x, y, w, height, 6, p.accent, 1.4, 1);
  for (let row = 1; row < 4; row += 1) {
    c.globalAlpha = 0.45;
    line(c, x, y + row * rowHeight, x + w, y + row * rowHeight);
  }
  for (let col = 1; col < 3; col += 1) {
    c.globalAlpha = 0.45;
    line(c, x + (col * w) / 3, y, x + (col * w) / 3, y + height);
  }
  c.globalAlpha = 0.28;
  c.fillStyle = p.accent;
  for (let q = 0; q <= litRows; q += 1) {
    c.fillRect(x + 1, y + q * rowHeight + 1, w - 2, rowHeight - 2);
  }
}

function handoffOutbound(c: DrawContext, p: Palette, xo: number, y: number, a: number): void {
  c.globalAlpha = a;
  c.fillStyle = p.card;
  roundRect(c, xo - 9, y - 6, 18, 12, 3);
  c.fill();
  strokeRound(c, xo - 9, y - 6, 18, 12, 3, p.accent, 1.4, a);
  c.fillStyle = p.accent;
  c.globalAlpha = a * 0.8;
  c.fillRect(xo - 5, y - 1, 10, 2);
}

function edge(progress: number): number {
  return Math.min(1, progress * 8) * Math.min(1, (1 - progress) * 8);
}

const handoff: FrameFunction = (c, w, h, t, p) => {
  const fx = w * 0.17;
  const sx = w * 0.83;
  const y1 = h * 0.36;
  const y2 = h * 0.66;
  const dh = h * 0.6;
  const top = h / 2 - dh / 2;
  strokeRound(c, fx - 20, top, 40, dh, 7, p.dim, 1.4, 1);
  for (let j = 0; j < 4; j += 1) {
    fillRound(c, fx - 12, top + 12 + j * 14, 24 - (j % 2) * 8, 3, 1.5, p.dim, 0.7);
  }
  const cycle = t / 3.4;
  handoffSheet(c, p, sx - 34, top, 68, dh / 4, Math.floor((cycle % 1) * 4));
  c.globalAlpha = 0.5;
  c.strokeStyle = p.dim;
  c.setLineDash([3, 6]);
  line(c, fx + 30, y1, sx - 44, y1);
  line(c, fx + 30, y2, sx - 44, y2);
  c.setLineDash([]);
  for (let k = 0; k < 3; k += 1) {
    const out = (cycle + k / 3) % 1;
    handoffOutbound(c, p, lerp(fx + 34, sx - 48, out), y1, edge(out));
    const back = (cycle + k / 3 + 0.5) % 1;
    const xb = lerp(sx - 48, fx + 34, back);
    const a = edge(back);
    fillRound(c, xb - 9, y2 - 6, 18, 12, 3, p.accent, a);
    lock(c, xb, y2 + 1, 6, p.bg, a);
    if (back > 0.9) lock(c, fx + 20, top + 14 + (k % 4) * 14, 7, p.accent, (back - 0.9) * 10);
  }
  c.globalAlpha = 1;
};

type ExtractGeometry = {
  readonly lx: number;
  readonly lw: number;
  readonly top: number;
  readonly span: number;
  readonly lineHeight: number;
  readonly rx: number;
  readonly rw: number;
};

function extractCall(
  c: DrawContext,
  p: Palette,
  g: ExtractGeometry,
  i: number,
  y: number,
  barEnd: number,
  scan: number,
): void {
  const tx = barEnd + 8;
  const pass = ((y - g.top) / g.span) * 4;
  const progress = clamp((scan - pass) / 1.1, 0, 1);
  const slot = Math.floor(i / 3);
  const ey = g.top + 16 + slot * ((g.span - 30) / 3) + 6;
  const ex = g.rx + 14;
  if (scan < pass) {
    fillRound(c, tx, y - 4, 22, 8, 4, p.warn, 0.9);
    return;
  }
  if (progress < 1) {
    const e = easeInOut(progress);
    const py = lerp(y, ey, e) - Math.sin(e * Math.PI) * 14;
    fillRound(c, lerp(tx, ex, e), py - 4, 22, 8, 4, p.warn, 1);
    return;
  }
  fillRound(c, ex, ey - 4, 22, 8, 4, p.accent, 0.95);
  fillRound(c, ex + 28, ey - 2, g.rw - 50, 4, 2, p.muted, 0.6);
}

const extract: FrameFunction = (c, w, h, t, p) => {
  const lw = Math.min(150, w * 0.38);
  const top = 18;
  const count = 10;
  const span = h - top * 2;
  const g: ExtractGeometry = {
    lx: w * 0.09,
    lw,
    top,
    span,
    lineHeight: span / count,
    rx: w * 0.66,
    rw: Math.min(w * 0.26, 100),
  };
  const scan = t % 5.2;
  const scanY = clamp(scan / 4, 0, 1) * span + top;
  strokeRound(c, g.rx, top, g.rw, span, 8, p.dim, 1.2, 0.6);
  for (let i = 0; i < count; i += 1) {
    const y = top + i * g.lineHeight + g.lineHeight / 2;
    const indent = hash(i, 1) < 0.5 ? 0 : 14;
    const barWidth = 24 + hash(i, 9) * (lw - 50);
    fillRound(c, g.lx + indent, y - 2, barWidth, 4, 2, p.dim, 0.6);
    if (i % 3 === 1) extractCall(c, p, g, i, y, g.lx + indent + barWidth, scan);
  }
  if (scan < 4.2) {
    c.globalAlpha = 0.18;
    c.fillStyle = p.accent;
    c.fillRect(g.lx - 6, scanY - 10, lw + 40, 10);
    c.globalAlpha = 1;
    c.strokeStyle = p.accent;
    c.lineWidth = 1.4;
    line(c, g.lx - 6, scanY, g.lx + lw + 34, scanY);
  }
  c.globalAlpha = 1;
};

function spikeAt(tt: number, spikes: ReadonlyArray<number>): number {
  let value = 0;
  for (const spike of spikes) {
    const dt = tt - spike;
    if (dt > -0.5 && dt < 0.9) value += Math.exp(-dt * dt * 28) * (dt < 0 ? 1 : Math.cos(dt * 14));
  }
  return value;
}

const watch: FrameFunction = (c, w, h, t, p) => {
  const names = 4;
  const top = 34;
  const gap = (h - top * 2) / (names - 1);
  const speed = 46;
  const x0 = 18;
  const xr = w - 26;
  const spikes: number[] = [];
  for (let k = -2; k < 14; k += 1) spikes.push(k * 2.6 + hash(k, 5) * 1.3);
  for (let i = 0; i < names; i += 1) {
    const yb = top + i * gap;
    const amp = i === 0 ? 20 : 14 - i * 1.5;
    const delay = i * 0.55;
    const color = i === 0 ? p.fg : p.accent;
    c.lineWidth = 1.4;
    c.globalAlpha = i === 0 ? 1 : 0.85 - i * 0.1;
    c.strokeStyle = color;
    c.beginPath();
    for (let x = x0; x <= xr; x += 2) {
      const y = yb - spikeAt(t - (xr - x) / speed - delay, spikes) * amp;
      if (x === x0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.globalAlpha = 0.9;
    c.fillStyle = color;
    circle(c, xr, yb, 2.6);
    c.fill();
    c.globalAlpha = 0.35;
    c.strokeStyle = p.dim;
    c.lineWidth = 1;
    c.setLineDash([2, 5]);
    line(c, x0, yb + 6, xr, yb + 6);
    c.setLineDash([]);
  }
  c.globalAlpha = 0.5;
  c.strokeStyle = p.accent;
  c.lineWidth = 1;
  line(c, xr, top - 14, xr, h - top + 12);
  c.globalAlpha = 1;
};

const TOKEN_W = 56;
const TOKEN_H = 28;
const TOKEN_GAP = 22;

function typeToken(
  c: DrawContext,
  p: Palette,
  x: number,
  y: number,
  color: string,
  alpha: number,
  bars: number,
): void {
  fillRound(c, x, y - TOKEN_H / 2, TOKEN_W, TOKEN_H, 8, p.card, alpha);
  strokeRound(c, x, y - TOKEN_H / 2, TOKEN_W, TOKEN_H, 8, color, 1.6, alpha);
  fillRound(c, x + 9, y - 6, 22 + bars * 6, 4, 2, color, alpha);
  fillRound(c, x + 9, y + 3, 18, 4, 2, color, alpha * 0.6);
}

function typeBrackets(c: DrawContext, p: Palette, left: number, width: number, cy: number): void {
  c.globalAlpha = 0.55;
  c.strokeStyle = p.accent;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(left + 8, cy - 30);
  c.lineTo(left, cy - 30);
  c.lineTo(left, cy + 30);
  c.lineTo(left + 8, cy + 30);
  c.stroke();
  c.beginPath();
  c.moveTo(left + width - 8, cy - 30);
  c.lineTo(left + width, cy - 30);
  c.lineTo(left + width, cy + 30);
  c.lineTo(left + width - 8, cy + 30);
  c.stroke();
}

function typeAccepted(
  c: DrawContext,
  p: Palette,
  w: number,
  cy: number,
  slotX: number,
  k: number,
  cycle: number,
): void {
  const start = 0.4 + k * 0.8;
  const progress = clamp((cycle - start) / 0.9, 0, 1);
  if (progress <= 0) return;
  const eased = 1 - (1 - progress) ** 4;
  const over =
    progress > 0.8 && progress < 1 ? Math.sin(((progress - 0.8) / 0.2) * Math.PI) * 2 : 0;
  typeToken(c, p, lerp(w + 20, slotX, eased), cy - over, p.accent, Math.min(1, progress * 3), k);
  const ripple = (cycle - start - 0.9) / 0.5;
  if (progress >= 1 && ripple < 1) {
    strokeRound(
      c,
      slotX - ripple * 8,
      cy - TOKEN_H / 2 - ripple * 8,
      TOKEN_W + ripple * 16,
      TOKEN_H + ripple * 16,
      8 + ripple * 6,
      p.accent,
      1.3,
      1 - ripple,
    );
  }
}

function typeRejected(
  c: DrawContext,
  p: Palette,
  w: number,
  cy: number,
  slotX: number,
  cycle: number,
): void {
  const progress = clamp((cycle - 3.7) / 1.1, 0, 1);
  if (progress <= 0 || progress >= 1) return;
  const alpha = 1 - Math.max(0, (progress - 0.7) / 0.3);
  const x =
    progress < 0.5
      ? lerp(w + 20, slotX + 14, easeOut(progress / 0.5))
      : lerp(slotX + 14, slotX + 80, easeOut((progress - 0.5) / 0.5));
  const shake = progress > 0.45 && progress < 0.6 ? Math.sin(progress * 160) * 3 : 0;
  typeToken(c, p, x, cy + shake, p.bad, alpha, 2);
  if (progress > 0.45) {
    strokeRound(c, slotX, cy - TOKEN_H / 2, TOKEN_W, TOKEN_H, 8, p.bad, 1.6, 0.9 * alpha);
  }
}

const types: FrameFunction = (c, w, h, t, p) => {
  const cycle = t % 6.4;
  const count = 3;
  const step = TOKEN_W + TOKEN_GAP;
  const gx = (w - (count + 1) * TOKEN_W - count * TOKEN_GAP) / 2;
  const cy = h * 0.5;
  c.lineWidth = 1.3;
  c.strokeStyle = p.dim;
  c.globalAlpha = 0.7;
  c.setLineDash([3, 4]);
  for (let i = 0; i < count + 1; i += 1) {
    roundRect(c, gx + i * step, cy - TOKEN_H / 2, TOKEN_W, TOKEN_H, 8);
    c.stroke();
  }
  c.setLineDash([]);
  typeBrackets(c, p, gx - 14, (count + 1) * TOKEN_W + count * TOKEN_GAP + 28, cy);
  for (let k = 0; k < count; k += 1) typeAccepted(c, p, w, cy, gx + k * step, k, cycle);
  typeRejected(c, p, w, cy, gx + count * step, cycle);
  c.globalAlpha = 1;
};

function doctorRow(c: DrawContext, p: Palette, cx: number, y: number, i: number, T: number): void {
  const progress = clamp((T - 0.4 - i * 0.7) / 0.6, 0, 1);
  c.globalAlpha = 0.6;
  c.strokeStyle = p.dim;
  c.lineWidth = 1.4;
  circle(c, cx, y, 9);
  c.stroke();
  c.globalAlpha = 1;
  c.strokeStyle = p.accent;
  c.lineWidth = 2;
  if (progress > 0) {
    c.beginPath();
    c.arc(cx, y, 9, -Math.PI / 2, -Math.PI / 2 + Math.min(1, progress * 1.6) * TAU);
    c.stroke();
  }
  if (progress > 0.6) {
    const q = (progress - 0.6) / 0.4;
    c.beginPath();
    c.moveTo(cx - 4, y + 0.5);
    c.lineTo(cx - 1, y + 3.5 * Math.min(1, q * 2));
    if (q > 0.5) c.lineTo(cx - 1 + 6 * ((q - 0.5) * 2), y + 3.5 - 8 * ((q - 0.5) * 2));
    c.stroke();
  }
  fillRound(c, cx + 22, y - 2, 40 + hash(i, 4) * 40, 4, 2, progress >= 1 ? p.muted : p.dim, 0.55);
}

function doctorBars(c: DrawContext, p: Palette, w: number, h: number, T: number): void {
  const bx = w * 0.55;
  const bw = w * 0.36;
  const by = h - 30;
  const bh = h - 62;
  const cols = 9;
  const barWidth = bw / cols - 5;
  const grown = easeOut(clamp((T - 3.2) / 1.4, 0, 1));
  c.globalAlpha = 0.5;
  c.strokeStyle = p.dim;
  c.lineWidth = 1;
  line(c, bx - 4, by, bx + bw, by);
  for (let k = 0; k < cols; k += 1) {
    const height = (0.25 + hash(k, 11) * 0.55) * bh * grown;
    const selected = k === 6;
    fillRound(
      c,
      bx + k * (barWidth + 5),
      by - height,
      barWidth,
      Math.max(height, 0),
      3,
      selected ? p.accent : p.dim,
      selected ? 1 : 0.55,
    );
  }
  c.globalAlpha = 0.8;
  c.strokeStyle = p.warn;
  c.lineWidth = 1.2;
  c.setLineDash([4, 4]);
  line(c, bx - 8, by - bh * 0.62, bx + bw + 4, by - bh * 0.62);
  c.setLineDash([]);
}

const doctor: FrameFunction = (c, w, h, t, p) => {
  const T = t % 6.2;
  const rows = 4;
  const top = 28;
  const gap = (h - top * 2) / (rows - 1);
  for (let i = 0; i < rows; i += 1) doctorRow(c, p, w * 0.1 + 10, top + i * gap, i, T);
  doctorBars(c, p, w, h, T);
  c.globalAlpha = 1;
};

const FRAME_FUNCTIONS: Readonly<Record<LandingFeatureId, FrameFunction>> = {
  studio,
  handoff,
  extract,
  watch,
  types,
  doctor,
};

export const STILL_TIME: Readonly<Record<LandingFeatureId, number>> = {
  studio: 9,
  handoff: 2.2,
  extract: 3.1,
  watch: 6,
  types: 3.9,
  doctor: 4.2,
};

export const RUN_SECONDS: Readonly<Record<LandingFeatureId, number>> = {
  studio: 24,
  handoff: 3 * 3.4,
  extract: 3 * 5.2,
  watch: 18,
  types: 3 * 6.4,
  doctor: 3 * 6.2,
};

export function canvasClock(
  id: LandingFeatureId,
  played: number,
  phase: number,
): { readonly time: number; readonly done: boolean } {
  if (played >= RUN_SECONDS[id]) return { time: STILL_TIME[id], done: true };
  return { time: played + phase, done: false };
}

export function drawFeature(
  id: LandingFeatureId,
  c: DrawContext,
  w: number,
  h: number,
  t: number,
  palette: Palette,
): void {
  c.globalAlpha = 1;
  FRAME_FUNCTIONS[id](c, w, h, t, palette);
}
