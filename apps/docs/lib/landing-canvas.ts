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
  };
}

type Point = { readonly x: number; readonly y: number };

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

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
  if (alpha <= 0 || w <= 0) return;
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
  if (alpha <= 0) return;
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
  if (alpha <= 0) return;
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

function ramp(t: number, start: number, length: number): number {
  return clamp((t - start) / length, 0, 1);
}

function loopFade(t: number, end: number, length: number): number {
  return 1 - ramp(t, end - length, length);
}

function tailFade(t: number, loop: number, length = 0.5): number {
  return loopFade(t, loop - FADE_MARGIN, length);
}

const DASH_SLOT: ReadonlyArray<number> = [3, 3];
const DASH_LINE: ReadonlyArray<number> = [3, 4];
const DASH_KEY: ReadonlyArray<number> = [2.5, 3];
const KEY_INSET = 10;
const VALUE_INSET = 40;
const FADE_MARGIN = 0.1;
const KEY_PILL_W = 24;
const STATUS_DOT_R = 4;
const PILL_H = 7;
const VALUE_H = 5;
const MARKER_R = 3;

function localeMarker(
  c: DrawContext,
  p: Palette,
  x: number,
  y: number,
  r: number,
  source: boolean,
  alpha: number,
): void {
  if (source) {
    statusDot(c, x, y, r, p.accent, alpha);
    return;
  }
  c.globalAlpha = alpha;
  c.strokeStyle = p.dim;
  c.lineWidth = 1.2;
  circle(c, x, y, r);
  c.stroke();
}

function localeFile(c: DrawContext, p: Palette, box: Box, source: boolean, alpha: number): void {
  fillRound(c, box.x, box.y, box.w, box.h, 7, p.card, alpha);
  strokeRound(c, box.x, box.y, box.w, box.h, 7, p.dim, 1.2, alpha);
  fillRound(c, box.x + 18, box.y + 8, box.w * 0.3, 3, 1.5, p.muted, alpha * 0.7);
  localeMarker(c, p, box.x + 11, box.y + 9.5, MARKER_R, source, alpha);
}

function fillSegment(
  c: DrawContext,
  b: Box,
  radii: { readonly left: number; readonly right: number },
  color: string,
  alpha: number,
): void {
  if (alpha <= 0 || b.w <= 0) return;
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(b.x + radii.left, b.y);
  c.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, radii.right);
  c.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, radii.right);
  c.arcTo(b.x, b.y + b.h, b.x, b.y, radii.left);
  c.arcTo(b.x, b.y, b.x + b.w, b.y, radii.left);
  c.closePath();
  c.fill();
}

function keyPill(c: DrawContext, x: number, cy: number, color: string, alpha: number): void {
  fillRound(c, x, cy - PILL_H / 2, KEY_PILL_W, PILL_H, PILL_H / 2, color, alpha);
}

function valueBar(
  c: DrawContext,
  x: number,
  cy: number,
  w: number,
  color: string,
  alpha: number,
): void {
  fillRound(c, x, cy - VALUE_H / 2, w, VALUE_H, VALUE_H / 2, color, alpha);
}

function statusDot(
  c: DrawContext,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0) return;
  c.globalAlpha = alpha;
  c.fillStyle = color;
  circle(c, x, y, r);
  c.fill();
}

function checkMark(
  c: DrawContext,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
  progress: number,
): void {
  const q = clamp(progress, 0, 1);
  if (q <= 0 || alpha <= 0) return;
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(x - size * 0.5, y);
  c.lineTo(x - size * 0.15, y + size * 0.35 * Math.min(1, q * 2));
  if (q > 0.5) {
    const k = (q - 0.5) * 2;
    c.lineTo(x - size * 0.15 + size * 0.65 * k, y + size * 0.35 - size * 0.8 * k);
  }
  c.stroke();
}

export const PHASE_STEP = 1.3;

export const LOOP_SECONDS: Readonly<Record<LandingFeatureId, number>> = {
  studio: 21,
  handoff: 7.5,
  extract: 6,
  watch: 9,
  types: 7,
  doctor: 7,
};

type Span = { readonly avail: number; readonly left: number };

function span(w: number): Span {
  const avail = Math.min(Math.max(w - 24, 0), 440);
  return { avail, left: (w - avail) / 2 };
}

function bump(t: number, start: number, length: number): number {
  return Math.sin(ramp(t, start, length) * Math.PI);
}

function dashedRound(c: DrawContext, box: Box, radius: number, color: string, alpha: number): void {
  c.setLineDash(DASH_SLOT);
  strokeRound(c, box.x, box.y, box.w, box.h, radius, color, 1.2, alpha);
  c.setLineDash([]);
}

function dashedLine(c: DrawContext, from: Point, to: Point, color: string, alpha: number): void {
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.setLineDash(DASH_LINE);
  line(c, from.x, from.y, to.x, to.y);
  c.setLineDash([]);
}

function bracket(
  c: DrawContext,
  x: number,
  cy: number,
  side: 1 | -1,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0) return;
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = 1.4;
  c.beginPath();
  if (side === 1) c.arc(x + 4, cy, 7, Math.PI * 0.65, Math.PI * 1.35);
  else c.arc(x - 4, cy, 7, -Math.PI * 0.35, Math.PI * 0.35);
  c.stroke();
}

const CALL_PILL_OFFSET = 32;

function callShape(
  c: DrawContext,
  p: Palette,
  x: number,
  cy: number,
  tint: string,
  lit: number,
  alpha: number,
): void {
  valueBar(c, x, cy, 22, p.muted, 0.6 * alpha);
  bracket(c, x + 27, cy, 1, tint, (0.3 + 0.7 * lit) * alpha);
  bracket(c, x + 61, cy, -1, tint, (0.3 + 0.7 * lit) * alpha);
}

function argChip(c: DrawContext, p: Palette, x: number, cy: number, alpha: number): void {
  bracket(c, x, cy, 1, p.accent, alpha);
  bracket(c, x + 12, cy, -1, p.accent, alpha);
  statusDot(c, x + 6, cy, 2, p.accent, alpha * 0.8);
}

function xMark(
  c: DrawContext,
  x: number,
  cy: number,
  size: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0) return;
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = 1.8;
  line(c, x - size, cy - size, x + size, cy + size);
  line(c, x - size, cy + size, x + size, cy - size);
}

const STUDIO_TAB_SECONDS = 7;
const STUDIO_TABS = 3;
const STUDIO_ROWS = 3;
const STUDIO_ROW_HEIGHT = 20;
const STUDIO_ROW_GAP = 16;
const STUDIO_GROW = 16;
const STUDIO_TAB_WIDTH = 28;
const STUDIO_TAB_HEIGHT = 12;
const STUDIO_TAB_GAP = 8;

type EditBeat = { readonly grow: number; readonly typed: number; readonly flip: number };

function editBeat(T: number, start: number): EditBeat {
  return {
    grow: easeOut(ramp(T, start, 0.4)) - easeOut(ramp(T, start + 1.8, 0.4)),
    typed: easeOut(ramp(T, start + 0.4, 1.2)),
    flip: ramp(T, start + 1.6, 0.25),
  };
}

function studioView(w: number, h: number): Box {
  const { avail, left } = span(w);
  return { x: left, y: 14, w: avail, h: h - 28 };
}

function studioChrome(c: DrawContext, p: Palette, v: Box): void {
  fillRound(c, v.x, v.y, v.w, v.h, 10, p.card, 0.85);
  strokeRound(c, v.x, v.y, v.w, v.h, 10, p.dim, 1.2, 0.9);
  c.globalAlpha = 0.6;
  c.strokeStyle = p.border;
  c.lineWidth = 1;
  line(c, v.x, v.y + 30, v.x + v.w, v.y + 30);
}

function studioTabX(v: Box, index: number): number {
  return v.x + 12 + index * (STUDIO_TAB_WIDTH + STUDIO_TAB_GAP);
}

function studioPrevious(lap: number, tab: number): number {
  return lap === 0 ? tab : (tab + STUDIO_TABS - 1) % STUDIO_TABS;
}

function studioTabs(
  c: DrawContext,
  p: Palette,
  v: Box,
  tab: number,
  previous: number,
  T: number,
): void {
  const y = v.y + 12;
  for (let i = 0; i < STUDIO_TABS; i += 1) {
    const x = studioTabX(v, i);
    strokeRound(c, x, y, STUDIO_TAB_WIDTH, STUDIO_TAB_HEIGHT, 6, p.dim, 1, 0.7);
    localeMarker(c, p, x + STUDIO_TAB_WIDTH / 2, y + STUDIO_TAB_HEIGHT / 2, MARKER_R, i === 0, 0.9);
  }
  const x = lerp(studioTabX(v, previous), studioTabX(v, tab), easeInOut(ramp(T, 0, 0.6)));
  fillRound(c, x, y, STUDIO_TAB_WIDTH, STUDIO_TAB_HEIGHT, 6, p.accent, 0.25);
  strokeRound(c, x, y, STUDIO_TAB_WIDTH, STUDIO_TAB_HEIGHT, 6, p.accent, 1.2, 1);
}

type StudioRow = {
  readonly index: number;
  readonly tab: number;
  readonly previous: number;
  readonly y: number;
  readonly height: number;
  readonly edit: EditBeat | null;
};

function studioTargetAt(v: Box, tab: number, index: number): number {
  const room = Math.max(v.w - 94, 0);
  return (0.55 + hash(tab * STUDIO_ROWS + index, 5) * 0.45) * room;
}

function studioTarget(v: Box, row: StudioRow): number {
  return studioTargetAt(v, row.tab, row.index);
}

function studioInput(
  c: DrawContext,
  p: Palette,
  v: Box,
  row: StudioRow,
  alpha: number,
  T: number,
): void {
  const edit = row.edit;
  if (!edit || edit.grow <= 0) return;
  const ix = v.x + 22;
  const iy = row.y + 21;
  const iw = Math.max(v.w - 44, 0);
  const ih = Math.max(0, row.height - 25);
  strokeRound(c, ix, iy, iw, ih, 4, p.accent, 1.2, alpha * edit.grow);
  const barWidth = edit.typed * Math.min(studioTarget(v, row), Math.max(iw - 16, 0));
  valueBar(c, ix + 6, iy + ih / 2, barWidth, p.dim, alpha * edit.grow);
  if (edit.grow > 0.5 && Math.floor(T * 2) % 2 === 0) {
    c.globalAlpha = alpha;
    c.fillStyle = p.fg;
    c.fillRect(ix + 8 + barWidth, iy + (ih - 7) / 2, 1.5, 7);
  }
}

function studioRow(
  c: DrawContext,
  p: Palette,
  v: Box,
  row: StudioRow,
  alpha: number,
  T: number,
): void {
  const x = v.x + 12;
  const rw = v.w - 24;
  const edit = row.edit;
  const cy = row.y + STUDIO_ROW_HEIGHT / 2;
  strokeRound(c, x, row.y, rw, row.height, 5, p.dim, 1, alpha * 0.7);
  keyPill(c, x + KEY_INSET, cy, p.muted, alpha * 0.9);
  const target = studioTarget(v, row);
  const settled = edit ? lerp(target * 0.55, target, edit.typed) : target;
  const width = lerp(
    studioTargetAt(v, row.previous, row.index),
    settled,
    easeInOut(ramp(T, 0, 0.6)),
  );
  valueBar(c, x + 44, cy, width, p.dim, alpha * 0.9 * (1 - (edit ? edit.grow : 0)));
  const warn = edit ? 1 - edit.flip : 0;
  const dots = alpha * ramp(T, 0, 0.5) * tailFade(T, STUDIO_TAB_SECONDS);
  statusDot(c, x + rw - 12, cy, STATUS_DOT_R, p.warn, dots * warn);
  statusDot(c, x + rw - 12, cy, STATUS_DOT_R, p.accent, dots * (1 - warn));
  studioInput(c, p, v, row, alpha, T);
}

function studioEdits(tab: number, T: number): ReadonlyArray<EditBeat | null> {
  const done = Math.min(STUDIO_ROWS - 1, Math.floor(hash(tab, 1) * STUDIO_ROWS));
  const beats = [editBeat(T, 1.2), editBeat(T, 3.8)];
  let next = 0;
  return Array.from({ length: STUDIO_ROWS }, (_, index) => {
    if (index === done) return null;
    const beat = beats[next] ?? null;
    next += 1;
    return beat;
  });
}

function studioRows(v: Box, tab: number, previous: number, T: number): StudioRow[] {
  const edits = studioEdits(tab, T);
  const rows: StudioRow[] = [];
  let y = v.y + 38;
  for (let index = 0; index < STUDIO_ROWS; index += 1) {
    const edit = edits[index] ?? null;
    const height = STUDIO_ROW_HEIGHT + (edit ? edit.grow * STUDIO_GROW : 0);
    rows.push({ index, tab, previous, y, height, edit });
    y += height + STUDIO_ROW_GAP;
  }
  return rows;
}

function studioQueue(
  c: DrawContext,
  p: Palette,
  v: Box,
  tabs: { readonly tab: number; readonly previous: number },
  T: number,
): void {
  const alpha = 0.4 + 0.6 * ramp(T, 0, 0.6) * tailFade(T, STUDIO_TAB_SECONDS);
  const rows = studioRows(v, tabs.tab, tabs.previous, T);
  for (const row of rows) studioRow(c, p, v, row, alpha, T);
  const focus = rows.filter((row) => row.edit !== null);
  const first = focus[0];
  const second = focus[1];
  if (first && second) studioRing(c, p, v, first, second, T);
}

function studioRing(
  c: DrawContext,
  p: Palette,
  v: Box,
  first: StudioRow,
  second: StudioRow,
  T: number,
): void {
  const settle = easeOut(ramp(T, 0.8, 0.4));
  const alpha = settle * loopFade(T, STUDIO_TAB_SECONDS - 0.6, 0.4);
  if (alpha <= 0) return;
  const move = easeInOut(ramp(T, 3.4, 0.4));
  const outset = 3 + (1 - settle) * 4;
  strokeRound(
    c,
    v.x + 12 - outset,
    lerp(first.y, second.y, move) - outset,
    v.w - 24 + outset * 2,
    lerp(first.height, second.height, move) + outset * 2,
    7,
    p.fg,
    1.6,
    alpha,
  );
}

const studio: FrameFunction = (c, w, h, t, p) => {
  const lap = Math.floor(t / STUDIO_TAB_SECONDS);
  const tab = lap % STUDIO_TABS;
  const T = t % STUDIO_TAB_SECONDS;
  const view = studioView(w, h);
  studioChrome(c, p, view);
  const previous = studioPrevious(lap, tab);
  studioTabs(c, p, view, tab, previous, T);
  studioQueue(c, p, view, { tab, previous }, T);
  c.globalAlpha = 1;
};

const HANDOFF_ROWS = 3;
const HANDOFF_SWEEP_START = 4.8;
const HANDOFF_SWEEP_SPAN = 1.6;
const SHEET_W = 34;
const SHEET_H = 26;
const HANDOFF_LOCK_SIZE = 8;
const PERSON_W = 28;

type HandoffGeometry = {
  readonly file: Box;
  readonly person: Box;
  readonly sheetFrom: number;
  readonly sheetTo: number;
  readonly sheetY: number;
  readonly barMax: number;
};

function handoffGeometry(w: number, h: number): HandoffGeometry {
  const { avail, left } = span(w);
  const fileW = clamp(avail * 0.42, 96, 170);
  const file = { x: left, y: (h - 120) / 2, w: fileW, h: 120 };
  const person = { x: left + avail - PERSON_W, y: h / 2 - 22, w: PERSON_W, h: 44 };
  const sheetFrom = left + fileW + 12;
  const sheetTo = Math.max(sheetFrom, person.x - 12 - SHEET_W);
  return {
    file,
    person,
    sheetFrom,
    sheetTo,
    sheetY: h / 2 - SHEET_H / 2,
    barMax: Math.min(Math.max(fileW - 68, 28), 90),
  };
}

function handoffRowY(g: HandoffGeometry, index: number): number {
  return g.file.y + 38 + index * 30;
}

function handoffPass(g: HandoffGeometry, index: number): number {
  const top = g.file.y + 22;
  const bottom = g.file.y + g.file.h - 6;
  const along = (handoffRowY(g, index) - top) / Math.max(bottom - top, 1);
  return HANDOFF_SWEEP_START + HANDOFF_SWEEP_SPAN * clamp(along, 0, 1);
}

function handoffImported(
  c: DrawContext,
  p: Palette,
  g: HandoffGeometry,
  index: number,
  T: number,
  a: number,
): void {
  const f = g.file;
  const cy = handoffRowY(g, index);
  const grow = easeOut(ramp(T, 4.2 + 0.25 * index, 0.5));
  const slot = (0.6 + 0.4 * bump(T, 0.3, 0.7)) * (1 - grow) * a;
  if (slot > 0) {
    dashedRound(
      c,
      { x: f.x + VALUE_INSET, y: cy - VALUE_H / 2, w: g.barMax * 0.9, h: VALUE_H },
      2.5,
      p.muted,
      slot,
    );
  }
  valueBar(
    c,
    f.x + VALUE_INSET,
    cy,
    g.barMax * (0.75 + 0.25 * hash(index, 6)) * grow,
    p.accent,
    0.85 * a,
  );
  const glint = 1 + 0.3 * bump(T, handoffPass(g, index) - 0.1, 0.4);
  lock(
    c,
    f.x + f.w - 10,
    cy + 1,
    HANDOFF_LOCK_SIZE * glint,
    p.accent,
    ramp(T, 4.7 + 0.2 * index, 0.4) * a,
  );
}

function handoffMachine(
  c: DrawContext,
  p: Palette,
  g: HandoffGeometry,
  index: number,
  T: number,
  a: number,
): void {
  const f = g.file;
  const cy = handoffRowY(g, index);
  const pass = handoffPass(g, index);
  const refresh = easeOut(ramp(T, pass, 0.5));
  valueBar(c, f.x + VALUE_INSET, cy, g.barMax * (0.55 + 0.45 * refresh), p.dim, 0.9 * a);
  statusDot(c, f.x + f.w - 10, cy, STATUS_DOT_R, p.warn, a * (1 - refresh));
  statusDot(c, f.x + f.w - 10, cy, STATUS_DOT_R, p.accent, a * refresh);
  strokeRound(c, f.x + 5, cy - 11, f.w - 10, 22, 6, p.accent, 1.2, 0.8 * bump(T, pass, 0.6) * a);
}

function handoffRows(c: DrawContext, p: Palette, g: HandoffGeometry, T: number): void {
  const a = ramp(T, 0, 0.4) * tailFade(T, LOOP_SECONDS.handoff);
  for (let index = 0; index < HANDOFF_ROWS; index += 1) {
    keyPill(c, g.file.x + KEY_INSET, handoffRowY(g, index), p.muted, 0.9 * a);
    if (index < HANDOFF_ROWS - 1) handoffImported(c, p, g, index, T, a);
    else handoffMachine(c, p, g, index, T, a);
  }
}

function handoffSweep(c: DrawContext, p: Palette, g: HandoffGeometry, T: number): void {
  const progress = ramp(T, HANDOFF_SWEEP_START, HANDOFF_SWEEP_SPAN);
  const alpha =
    Math.min(1, progress * 6) * (1 - ramp(T, HANDOFF_SWEEP_START + HANDOFF_SWEEP_SPAN, 0.3));
  if (progress <= 0 || alpha <= 0) return;
  const f = g.file;
  const y = lerp(f.y + 22, f.y + f.h - 6, progress);
  c.globalAlpha = 0.07 * alpha;
  c.fillStyle = p.fg;
  c.fillRect(f.x + 3, y - 14, f.w - 6, 14);
  c.globalAlpha = 0.5 * alpha;
  c.strokeStyle = p.fg;
  c.lineWidth = 1.2;
  line(c, f.x + 4, y, f.x + f.w - 4, y);
}

function handoffSheet(c: DrawContext, p: Palette, g: HandoffGeometry, T: number): void {
  const away = easeInOut(ramp(T, 0.8, 1)) - easeInOut(ramp(T, 3.2, 1));
  const alpha = ramp(T, 0.8, 0.3) * tailFade(T, LOOP_SECONDS.handoff);
  if (alpha <= 0) return;
  const x = lerp(g.sheetFrom, g.sheetTo, away);
  const y = g.sheetY;
  fillRound(c, x, y, SHEET_W, SHEET_H, 4, p.card, alpha);
  fillRound(c, x + 1, y + 1, SHEET_W - 2, 8, 3, p.accent, 0.3 * alpha);
  strokeRound(c, x, y, SHEET_W, SHEET_H, 4, p.accent, 1.4, alpha);
  c.globalAlpha = 0.5 * alpha;
  c.strokeStyle = p.border;
  c.lineWidth = 1;
  line(c, x, y + 10, x + SHEET_W, y + 10);
  const cy = y + 18;
  valueBar(c, x + 4, cy, 10, p.muted, 0.8 * alpha);
  valueBar(c, x + 19, cy, 12, p.dim, 0.5 * alpha);
  valueBar(c, x + 19, cy, 12 * ramp(T, 2, 0.45), p.accent, 0.85 * alpha);
}

function handoffPerson(c: DrawContext, p: Palette, person: Box): void {
  const cx = person.x + person.w / 2;
  fillRound(c, cx - 5, person.y, 10, 10, 5, p.muted, 0.85);
  c.globalAlpha = 0.85;
  c.strokeStyle = p.muted;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, person.y + 30, 12, Math.PI * 1.1, Math.PI * 1.9);
  c.stroke();
}

const handoff: FrameFunction = (c, w, h, t, p) => {
  const g = handoffGeometry(w, h);
  const T = t % LOOP_SECONDS.handoff;
  localeFile(c, p, g.file, false, 1);
  handoffRows(c, p, g, T);
  handoffSweep(c, p, g, T);
  handoffPerson(c, p, g.person);
  handoffSheet(c, p, g, T);
  c.globalAlpha = 1;
};

const EXTRACT_LINES = 8;
const SCAN_START = 0.3;
const SCAN_SPAN = 3;
const FLIGHT_DELAY = 0.15;
const FLIGHT_SPAN = 0.9;
const EXTRACT_PEEK = 14;
const EXTRACT_FILE_ROWS = 3;
const FLIGHT_LIFT = 9;
const SCAN_PARK_PITCHES = 0.6;

type ExtractCall = { readonly line: number; readonly row: number; readonly isNew: boolean };

const EXTRACT_CALLS: ReadonlyArray<ExtractCall> = [
  { line: 1, row: 3, isNew: true },
  { line: 4, row: 1, isNew: false },
  { line: 6, row: 4, isNew: true },
];

type ExtractGeometry = {
  readonly code: Box;
  readonly file: Box;
  readonly target: Box;
  readonly pitch: number;
};

function extractGeometry(w: number, h: number): ExtractGeometry {
  const { avail, left } = span(w);
  const fileWidth = avail * 0.5;
  const codeWidth = Math.max(avail - fileWidth - EXTRACT_PEEK - 12, 0);
  const top = 20;
  const height = h - 40;
  const fileX = left + codeWidth + 12;
  return {
    code: { x: left, y: top, w: codeWidth, h: height },
    file: { x: fileX, y: top, w: fileWidth, h: height },
    target: { x: fileX + EXTRACT_PEEK, y: top - EXTRACT_PEEK, w: fileWidth, h: height },
    pitch: (height - 16) / EXTRACT_LINES,
  };
}

function lineCenter(g: ExtractGeometry, index: number): number {
  return g.code.y + 8 + (index + 0.5) * g.pitch;
}

function scanTop(g: ExtractGeometry): number {
  return g.code.y + 4;
}

function scanPark(g: ExtractGeometry): number {
  const last = Math.max(...EXTRACT_CALLS.map((call) => call.line));
  return lineCenter(g, last) + g.pitch * SCAN_PARK_PITCHES;
}

function callTime(g: ExtractGeometry, call: ExtractCall): number {
  const top = scanTop(g);
  const along = (lineCenter(g, call.line) - top) / Math.max(scanPark(g) - top, 1);
  return SCAN_START + SCAN_SPAN * clamp(along, 0, 1);
}

function rowCenter(g: ExtractGeometry, row: number): number {
  return g.file.y + 28 + row * 24;
}

function callPillX(g: ExtractGeometry): number {
  return g.code.x + 8 + CALL_PILL_OFFSET;
}

function extractCodeLine(
  c: DrawContext,
  p: Palette,
  g: ExtractGeometry,
  index: number,
  lit: number,
): void {
  const cy = lineCenter(g, index);
  const x = g.code.x + 8;
  if (EXTRACT_CALLS.some((call) => call.line === index)) {
    callShape(c, p, x, cy, p.accent, lit, 1);
    keyPill(c, callPillX(g), cy, p.muted, 0.9);
    return;
  }
  const indent = hash(index, 1) < 0.5 ? 0 : 12;
  valueBar(c, x + indent, cy, 20 + hash(index, 9) * Math.max(g.code.w - 56, 0), p.dim, 0.6);
}

function extractCode(
  c: DrawContext,
  p: Palette,
  g: ExtractGeometry,
  T: number,
  settle: number,
): void {
  strokeRound(c, g.code.x, g.code.y, g.code.w, g.code.h, 7, p.dim, 1.2, 0.6);
  for (let index = 0; index < EXTRACT_LINES; index += 1) {
    const call = EXTRACT_CALLS.find((entry) => entry.line === index);
    const lit = call ? easeOut(ramp(T, callTime(g, call), 0.25)) * settle : 0;
    extractCodeLine(c, p, g, index, lit);
  }
}

function extractScan(
  c: DrawContext,
  p: Palette,
  g: ExtractGeometry,
  T: number,
  settle: number,
): void {
  const progress = ramp(T, SCAN_START, SCAN_SPAN);
  const held = ramp(T, SCAN_START + SCAN_SPAN, 0.3);
  const alpha = Math.min(1, progress * 10) * settle;
  if (progress <= 0 || alpha <= 0) return;
  const y = lerp(scanTop(g), scanPark(g), progress);
  c.globalAlpha = 0.14 * alpha * (1 - held);
  c.fillStyle = p.accent;
  c.fillRect(g.code.x + 3, y - 8, g.code.w - 6, 8);
  c.globalAlpha = alpha;
  c.strokeStyle = p.accent;
  c.lineWidth = 1.4;
  line(c, g.code.x + 3, y, g.code.x + g.code.w - 3, y);
}

function fileRow(c: DrawContext, p: Palette, g: ExtractGeometry, row: number): void {
  const cy = rowCenter(g, row);
  const width = Math.max(28, (g.file.w - 64) * (0.5 + 0.5 * hash(row, 3)));
  keyPill(c, g.file.x + KEY_INSET, cy, p.muted, 0.9);
  valueBar(c, g.file.x + VALUE_INSET, cy, width, p.dim, 0.9);
}

function newRow(
  c: DrawContext,
  p: Palette,
  g: ExtractGeometry,
  call: ExtractCall,
  T: number,
  settle: number,
): void {
  const landed = callTime(g, call) + FLIGHT_DELAY + FLIGHT_SPAN;
  const since = T - landed;
  if (since < 0) return;
  const cy = rowCenter(g, call.row);
  keyPill(c, g.file.x + KEY_INSET, cy, p.muted, 0.9 * settle);
  dashedRound(
    c,
    { x: g.file.x + VALUE_INSET, y: cy - 3, w: Math.max(g.file.w - 64, 0), h: 6 },
    3,
    p.muted,
    0.9 * settle,
  );
  const dotX = g.file.x + g.file.w - 10;
  statusDot(c, dotX, cy, STATUS_DOT_R * easeOut(ramp(since, 0, 0.25)), p.warn, settle);
  const pulse = ramp(since, 0, 0.6);
  if (pulse > 0 && pulse < 1) {
    c.globalAlpha = (1 - pulse) * 0.8 * settle;
    c.strokeStyle = p.warn;
    c.lineWidth = 1.2;
    circle(c, dotX, cy, STATUS_DOT_R + pulse * 6);
    c.stroke();
  }
}

function knownCheck(
  c: DrawContext,
  p: Palette,
  g: ExtractGeometry,
  call: ExtractCall,
  T: number,
  settle: number,
): void {
  const start = callTime(g, call) + 0.2;
  const flash = ramp(T, start, 0.25);
  if (flash <= 0) return;
  const hold = 1 - ramp(T, start + 0.5, 0.4);
  const cy = rowCenter(g, call.row);
  strokeRound(c, g.file.x + 5, cy - 10, g.file.w - 10, 20, 5, p.accent, 1.2, flash * hold * settle);
  checkMark(c, g.file.x + g.file.w - 10, cy, 8, p.accent, (0.8 + 0.2 * hold) * settle, flash);
}

function extractFlight(
  c: DrawContext,
  p: Palette,
  g: ExtractGeometry,
  call: ExtractCall,
  T: number,
): void {
  const progress = ramp(T, callTime(g, call) + FLIGHT_DELAY, FLIGHT_SPAN);
  if (progress <= 0 || progress >= 1) return;
  const e = easeInOut(progress);
  const x = lerp(callPillX(g), g.file.x + KEY_INSET, e);
  const lift = Math.sin(e * Math.PI) * 14 + FLIGHT_LIFT * (1 - e);
  const cy = lerp(lineCenter(g, call.line), rowCenter(g, call.row), e) - lift;
  keyPill(c, x, cy, p.muted, 1);
  strokeRound(c, x - 2, cy - 5.5, KEY_PILL_W + 4, 11, 5.5, p.accent, 1.2, 1);
}

function extractFile(
  c: DrawContext,
  p: Palette,
  g: ExtractGeometry,
  T: number,
  settle: number,
): void {
  localeFile(c, p, g.target, false, 0.7);
  localeFile(c, p, g.file, true, 1);
  for (let row = 0; row < EXTRACT_FILE_ROWS; row += 1) fileRow(c, p, g, row);
  for (const call of EXTRACT_CALLS) {
    if (call.isNew) newRow(c, p, g, call, T, settle);
    else knownCheck(c, p, g, call, T, settle);
  }
}

const extract: FrameFunction = (c, w, h, t, p) => {
  const g = extractGeometry(w, h);
  const T = t % LOOP_SECONDS.extract;
  const settle = tailFade(T, LOOP_SECONDS.extract, 0.6);
  extractCode(c, p, g, T, settle);
  extractFile(c, p, g, T, settle);
  extractScan(c, p, g, T, settle);
  for (const call of EXTRACT_CALLS) if (call.isNew) extractFlight(c, p, g, call, T);
  c.globalAlpha = 1;
};

const WATCH_CYCLE = 4.5;
const WATCH_ROWS = 2;
const WATCH_TARGETS = 3;
const WATCH_TARGET_H = 32;
const WATCH_ROW_OFFSET = 21;
const WATCH_SETTLE = 0.8;
const WATCH_RING_R = 10;
const WATCH_ORBIT = 1.5;

type WatchGeometry = {
  readonly source: Box;
  readonly targets: ReadonlyArray<Box>;
  readonly ring: Point;
  readonly barMax: number;
};

function watchGeometry(w: number, h: number): WatchGeometry {
  const { avail, left } = span(w);
  const fileW = clamp(avail * 0.34, 84, 130);
  const stack = WATCH_TARGETS * WATCH_TARGET_H + (WATCH_TARGETS - 1) * 10;
  const top = (h - stack) / 2;
  const targets = Array.from({ length: WATCH_TARGETS }, (_, index) => ({
    x: left + avail - fileW,
    y: top + index * (WATCH_TARGET_H + 10),
    w: fileW,
    h: WATCH_TARGET_H,
  }));
  return {
    source: { x: left, y: (h - 92) / 2, w: fileW, h: 92 },
    targets,
    ring: { x: left + avail / 2, y: h / 2 },
    barMax: fileW - 50,
  };
}

function watchSourceRow(g: WatchGeometry, row: number): number {
  return g.source.y + 38 + row * 28;
}

function watchBase(g: WatchGeometry, row: number): number {
  return g.barMax * (0.3 + 0.15 * hash(row, 2));
}

function watchCaret(c: DrawContext, p: Palette, at: Point, C: number): void {
  const alpha = ramp(C, 0.3, 0.1) * (1 - ramp(C, 1.3, 0.2));
  if (alpha <= 0) return;
  c.globalAlpha = alpha;
  c.fillStyle = p.fg;
  c.fillRect(at.x, at.y - 4.5, 1.5, 9);
}

function watchSource(
  c: DrawContext,
  p: Palette,
  g: WatchGeometry,
  edited: number,
  C: number,
): void {
  localeFile(c, p, g.source, true, 1);
  const typed = easeOut(ramp(C, 0.4, 0.9));
  const settle = loopFade(C, WATCH_CYCLE, WATCH_SETTLE);
  for (let row = 0; row < WATCH_ROWS; row += 1) {
    const cy = watchSourceRow(g, row);
    const base = watchBase(g, row);
    const width = row === edited ? lerp(base, g.barMax, typed * settle) : base;
    keyPill(c, g.source.x + KEY_INSET, cy, p.muted, 0.9);
    valueBar(c, g.source.x + VALUE_INSET, cy, width, p.dim, 0.9);
    if (row === edited) watchCaret(c, p, { x: g.source.x + VALUE_INSET + 3 + width, y: cy }, C);
  }
  strokeRound(
    c,
    g.source.x,
    g.source.y,
    g.source.w,
    g.source.h,
    7,
    p.accent,
    1.6,
    0.9 * bump(C, 1.5, 0.5),
  );
}

function watchTarget(c: DrawContext, p: Palette, g: WatchGeometry, index: number, C: number): void {
  const box = g.targets[index];
  if (!box) return;
  localeFile(c, p, box, false, 1);
  const fill = ramp(C, 2.9 + 0.2 * index, 0.9);
  const fade = loopFade(C, WATCH_CYCLE, 0.4);
  const cy = box.y + WATCH_ROW_OFFSET;
  keyPill(c, box.x + KEY_INSET, cy, p.muted, 0.9);
  valueBar(c, box.x + VALUE_INSET, cy, g.barMax * (0.5 + 0.3 * hash(index, 4)), p.dim, 0.9);
  valueBar(c, box.x + VALUE_INSET, cy, g.barMax * fill, p.accent, 0.85 * fade);
}

function watchPulse(c: DrawContext, p: Palette, at: Point, progress: number): void {
  if (progress <= 0 || progress >= 1) return;
  const alpha = Math.min(1, progress * 6) * Math.min(1, (1 - progress) * 6);
  fillRound(c, at.x - 5, at.y - 2.5, 10, 5, 2.5, p.accent, alpha);
}

function watchWires(c: DrawContext, p: Palette, g: WatchGeometry, C: number): void {
  const ring = g.ring;
  const inbound = { x: g.source.x + g.source.w, y: ring.y };
  const gate = { x: ring.x - WATCH_RING_R, y: ring.y };
  const out = { x: ring.x + WATCH_RING_R, y: ring.y };
  const legs = g.targets.map((box) => ({ x: box.x, y: box.y + WATCH_ROW_OFFSET }));
  dashedLine(c, inbound, gate, p.dim, 0.9);
  for (const to of legs) dashedLine(c, out, to, p.dim, 0.9);
  const arrive = ramp(C, 1.8, 0.5);
  watchPulse(c, p, { x: lerp(inbound.x, gate.x, arrive), y: ring.y }, arrive);
  const fan = ramp(C, 2.3, 0.6);
  for (const to of legs) {
    watchPulse(c, p, { x: lerp(out.x, to.x, fan), y: lerp(out.y, to.y, fan) }, fan);
  }
}

function watchRing(c: DrawContext, p: Palette, g: WatchGeometry, t: number, C: number): void {
  const { x, y } = g.ring;
  fillRound(
    c,
    x - WATCH_RING_R,
    y - WATCH_RING_R,
    WATCH_RING_R * 2,
    WATCH_RING_R * 2,
    WATCH_RING_R,
    p.card,
    1,
  );
  c.globalAlpha = 0.9;
  c.strokeStyle = p.dim;
  c.lineWidth = 1.4;
  circle(c, x, y, WATCH_RING_R);
  c.stroke();
  c.globalAlpha = 0.9 * bump(C, 2.2, 0.4);
  c.strokeStyle = p.accent;
  circle(c, x, y, WATCH_RING_R);
  c.stroke();
  const angle = (t * TAU) / WATCH_ORBIT;
  statusDot(
    c,
    x + Math.cos(angle) * WATCH_RING_R,
    y + Math.sin(angle) * WATCH_RING_R,
    STATUS_DOT_R,
    p.accent,
    1,
  );
}

const watch: FrameFunction = (c, w, h, t, p) => {
  const g = watchGeometry(w, h);
  const cycle = Math.floor(t / WATCH_CYCLE);
  const C = t % WATCH_CYCLE;
  const edited = cycle % WATCH_ROWS;
  watchWires(c, p, g, C);
  watchSource(c, p, g, edited, C);
  for (let index = 0; index < WATCH_TARGETS; index += 1) watchTarget(c, p, g, index, C);
  watchRing(c, p, g, t, C);
  c.globalAlpha = 1;
};

const TYPES_ROWS = 2;
const TYPES_BOX_H = 64;
const TYPES_ROW_TOP = 24;
const TYPES_ROW_PITCH = 18;
const TYPES_USAGE_TOP = 88;
const TYPES_USAGE_PITCH = 22;
const TYPES_HEIGHT = TYPES_USAGE_TOP + TYPES_USAGE_PITCH + PILL_H;
const TYPO_SEGMENTS: ReadonlyArray<number> = [15, 7];
const TYPO_GAP = 2;
const TYPO_DROP = 2;

type TypesGeometry = {
  readonly file: Box;
  readonly block: Box;
  readonly left: number;
  readonly rowA: number;
  readonly rowB: number;
  readonly bar: Box;
};

function typesGeometry(w: number, h: number): TypesGeometry {
  const { avail, left } = span(w);
  const top = (h - TYPES_HEIGHT) / 2;
  const blockW = clamp(avail * 0.42, 96, 170);
  const barX = left + avail * 0.52;
  const rowA = top + TYPES_USAGE_TOP;
  return {
    file: { x: left, y: top, w: clamp(avail * 0.38, 84, 150), h: TYPES_BOX_H },
    block: { x: left + avail - blockW, y: top, w: blockW, h: TYPES_BOX_H },
    left,
    rowA,
    rowB: rowA + TYPES_USAGE_PITCH,
    bar: { x: barX, y: rowA + TYPES_USAGE_PITCH / 2 - 4, w: left + avail - barX, h: 8 },
  };
}

function typesRowY(box: Box, row: number): number {
  return box.y + TYPES_ROW_TOP + row * TYPES_ROW_PITCH;
}

function typesFile(c: DrawContext, p: Palette, g: TypesGeometry): void {
  localeFile(c, p, g.file, true, 1);
  const barMax = g.file.w - 50;
  const widths = [0.75, 0.5];
  for (let row = 0; row < TYPES_ROWS; row += 1) {
    const cy = typesRowY(g.file, row);
    const width = barMax * (widths[row] ?? 0.5);
    keyPill(c, g.file.x + KEY_INSET, cy, p.muted, 0.9);
    valueBar(c, g.file.x + VALUE_INSET, cy, width, p.dim, 0.9);
    if (row === 1) argChip(c, p, g.file.x + VALUE_INSET + width + 8, cy, 0.9);
  }
}

function typesBrackets(c: DrawContext, p: Palette, box: Box): void {
  c.globalAlpha = 0.7;
  c.strokeStyle = p.accent;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(box.x + 9, box.y);
  c.lineTo(box.x, box.y);
  c.lineTo(box.x, box.y + box.h);
  c.lineTo(box.x + 9, box.y + box.h);
  c.stroke();
  c.beginPath();
  c.moveTo(box.x + box.w - 9, box.y);
  c.lineTo(box.x + box.w, box.y);
  c.lineTo(box.x + box.w, box.y + box.h);
  c.lineTo(box.x + box.w - 9, box.y + box.h);
  c.stroke();
}

function typesBlock(c: DrawContext, p: Palette, g: TypesGeometry, T: number, fade: number): void {
  const b = g.block;
  fillRound(c, b.x, b.y, b.w, b.h, 4, p.card, 0.6);
  typesBrackets(c, p, b);
  for (let row = 0; row < TYPES_ROWS; row += 1) {
    const shown = ramp(T, 0.4 + 0.5 * row, 0.4);
    const alpha = shown * fade;
    const cy = typesRowY(b, row);
    const slide = (1 - shown) * 6;
    keyPill(c, b.x + 14 - slide, cy, p.muted, 0.9 * alpha);
    if (row === 1) argChip(c, p, b.x + 50 - slide, cy, alpha);
    else valueBar(c, b.x + 46 - slide, cy, 20, p.dim, 0.7 * alpha);
  }
  const match = ramp(T, 2.4, 0.3) * fade;
  strokeRound(c, b.x + 8, typesRowY(b, 0) - 7, b.w - 16, 14, 4, p.accent, 1.2, match);
}

function typesUsage(c: DrawContext, p: Palette, g: TypesGeometry, T: number, fade: number): void {
  const x = g.left + 2;
  const valid = ramp(T, 1.9, 0.5) * fade;
  callShape(c, p, x, g.rowA, p.accent, valid, valid);
  keyPill(c, x + CALL_PILL_OFFSET, g.rowA, p.muted, 0.9 * valid);
  checkMark(c, x + 80, g.rowA, 8, p.accent, fade, ramp(T, 2.6, 0.4));
  const typo = ramp(T, 3.4, 0.5) * fade;
  callShape(c, p, x, g.rowB, p.bad, 0, typo);
  let offset = 0;
  TYPO_SEGMENTS.forEach((width, index) => {
    const last = index === TYPO_SEGMENTS.length - 1;
    const box = {
      x: x + CALL_PILL_OFFSET + offset,
      y: g.rowB - PILL_H / 2 + (index === 0 ? 0 : TYPO_DROP),
      w: width,
      h: PILL_H,
    };
    fillSegment(
      c,
      box,
      { left: last ? 0 : PILL_H / 2, right: last ? PILL_H / 2 : 0 },
      p.bad,
      0.9 * typo,
    );
    offset += width + TYPO_GAP;
  });
  typesSquiggle(c, p, { x: x + CALL_PILL_OFFSET - 2, y: g.rowB + 8 }, ramp(T, 3.9, 0.4), fade);
}

function typesSquiggle(
  c: DrawContext,
  p: Palette,
  from: Point,
  progress: number,
  fade: number,
): void {
  if (progress <= 0 || fade <= 0) return;
  c.globalAlpha = fade;
  c.strokeStyle = p.bad;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(from.x, from.y);
  const steps = Math.ceil(7 * progress);
  for (let step = 1; step <= steps; step += 1) {
    c.lineTo(from.x + step * 4, from.y + (step % 2 === 1 ? -2 : 2));
  }
  c.stroke();
}

function typesBuild(c: DrawContext, p: Palette, g: TypesGeometry, T: number, fade: number): void {
  const bar = g.bar;
  strokeRound(c, bar.x, bar.y, bar.w, bar.h, 4, p.dim, 1.2, 0.8);
  const fraction = 0.45 * easeInOut(ramp(T, 2.4, 0.8)) + 0.27 * easeOut(ramp(T, 3.8, 0.6));
  const failed = ramp(T, 4.3, 0.3);
  const width = bar.w * fraction;
  fillRound(c, bar.x, bar.y, width, bar.h, 4, p.accent, (1 - failed) * fade);
  fillRound(c, bar.x, bar.y, width, bar.h, 4, p.bad, failed * fade);
  xMark(c, bar.x + width + 10, bar.y + bar.h / 2, 4, p.bad, ramp(T, 4.4, 0.3) * fade);
}

const types: FrameFunction = (c, w, h, t, p) => {
  const g = typesGeometry(w, h);
  const T = t % LOOP_SECONDS.types;
  const fade = tailFade(T, LOOP_SECONDS.types);
  typesFile(c, p, g);
  typesBlock(c, p, g, T, fade);
  typesUsage(c, p, g, T, fade);
  typesBuild(c, p, g, T, fade);
  c.globalAlpha = 1;
};

const DOCTOR_ROWS = 4;
const DOCTOR_KEY_BAR_X = 48;
const DOCTOR_KEY_CHECK_X = 88;

type DoctorGeometry = {
  readonly left: number;
  readonly listWidth: number;
  readonly rowTop: number;
  readonly right: Box;
  readonly keyY: number;
  readonly estimateY: number;
};

function doctorGeometry(w: number, h: number): DoctorGeometry {
  const { avail, left } = span(w);
  const rightX = left + avail * 0.56;
  return {
    left,
    listWidth: clamp(avail * 0.44, 96, 190),
    rowTop: h / 2 - 42,
    right: { x: rightX, y: 0, w: left + avail - rightX, h },
    keyY: h / 2 - 32,
    estimateY: h / 2 + 26,
  };
}

function doctorRow(
  c: DrawContext,
  p: Palette,
  g: DoctorGeometry,
  index: number,
  T: number,
  fade: number,
): void {
  const cy = g.rowTop + index * 28;
  const cx = g.left + 8;
  const start = 0.4 + index * 0.7;
  const progress = ramp(T, start, 0.6);
  const settled = ramp(T, start + 0.6, 0.2) * fade;
  c.globalAlpha = 0.6;
  c.strokeStyle = p.dim;
  c.lineWidth = 1.4;
  circle(c, cx, cy, 7);
  c.stroke();
  if (progress > 0 && fade > 0) {
    c.globalAlpha = fade;
    c.strokeStyle = p.accent;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, 7, -Math.PI / 2, -Math.PI / 2 + Math.min(1, progress * 1.6) * TAU);
    c.stroke();
  }
  checkMark(c, cx, cy - 0.5, 8, p.accent, fade, (progress - 0.6) / 0.4);
  const labelMax = Math.max(g.listWidth - 26 - 10 - 28, 0);
  const labelWidth = 28 + hash(index, 4) * labelMax;
  valueBar(c, g.left + 26, cy, labelWidth, p.dim, 0.55 * (1 - settled));
  valueBar(c, g.left + 26, cy, labelWidth, p.muted, 0.55 * settled);
}

function keyGlyph(c: DrawContext, p: Palette, x: number, cy: number): void {
  c.globalAlpha = 0.85;
  c.strokeStyle = p.muted;
  c.lineWidth = 1.6;
  c.setLineDash(DASH_KEY);
  circle(c, x + 7.15, cy, 7.15);
  c.stroke();
  line(c, x + 14.3, cy, x + 39, cy);
  line(c, x + 31.2, cy, x + 31.2, cy + 6.5);
  line(c, x + 39, cy, x + 39, cy + 6.5);
  c.setLineDash([]);
}

function doctorKey(c: DrawContext, p: Palette, g: DoctorGeometry, T: number, fade: number): void {
  const x = g.right.x;
  keyGlyph(c, p, x, g.keyY);
  valueBar(c, x + DOCTOR_KEY_BAR_X, g.keyY, 24, p.muted, 0.7);
  checkMark(c, x + DOCTOR_KEY_CHECK_X, g.keyY, 8, p.accent, fade, ramp(T, 1, 0.4));
}

const DOCTOR_SEGMENTS: ReadonlyArray<number> = [0.22, 0.18, 0.16];
const DOCTOR_SEGMENT_ALPHA: ReadonlyArray<number> = [0.95, 0.7, 0.5];

function doctorEstimate(
  c: DrawContext,
  p: Palette,
  g: DoctorGeometry,
  T: number,
  fade: number,
): void {
  const { x, w } = g.right;
  const cy = g.estimateY;
  strokeRound(c, x, cy - 7, w, 14, 7, p.dim, 1.2, 0.8);
  let offset = 0;
  DOCTOR_SEGMENTS.forEach((fraction, index) => {
    const grown = easeOut(ramp(T, 3.2 + 0.5 * index, 0.5));
    const width = Math.max(0, w * fraction * grown - 2);
    const alpha = (DOCTOR_SEGMENT_ALPHA[index] ?? 0.5) * fade;
    fillRound(c, x + 3 + offset, cy - 4, width, 8, 3, p.accent, alpha);
    offset += w * fraction;
  });
  const ceilingX = x + w * 0.86;
  dashedLine(
    c,
    { x: ceilingX, y: cy - 16 },
    { x: ceilingX, y: cy + 16 },
    p.warn,
    0.9 * ramp(T, 2.8, 0.4) * fade,
  );
  checkMark(c, x + w * 0.56 + 12, cy, 8, p.accent, fade, ramp(T, 5, 0.4));
}

const doctor: FrameFunction = (c, w, h, t, p) => {
  const g = doctorGeometry(w, h);
  const T = t % LOOP_SECONDS.doctor;
  const fade = tailFade(T, LOOP_SECONDS.doctor);
  for (let index = 0; index < DOCTOR_ROWS; index += 1) doctorRow(c, p, g, index, T, fade);
  doctorKey(c, p, g, T, fade);
  doctorEstimate(c, p, g, T, fade);
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
  studio: 2.1,
  handoff: 5.85,
  extract: 4.4,
  watch: 3.5,
  types: 5,
  doctor: 5.8,
};

export const RUN_SECONDS: Readonly<Record<LandingFeatureId, number>> = {
  studio: LOOP_SECONDS.studio,
  handoff: 3 * LOOP_SECONDS.handoff,
  extract: 3 * LOOP_SECONDS.extract,
  watch: 3 * LOOP_SECONDS.watch,
  types: 3 * LOOP_SECONDS.types,
  doctor: 3 * LOOP_SECONDS.doctor,
};

function toMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

export function runEndSeconds(id: LandingFeatureId, phase: number): number {
  const loop = toMs(LOOP_SECONDS[id]);
  const still = toMs(STILL_TIME[id]);
  const offset = toMs(phase);
  const laps = Math.ceil((toMs(RUN_SECONDS[id]) + offset - still) / loop);
  return (laps * loop + still - offset) / 1000;
}

export function canvasClock(
  id: LandingFeatureId,
  played: number,
  phase: number,
): { readonly time: number; readonly done: boolean } {
  if (played >= runEndSeconds(id, phase)) return { time: STILL_TIME[id], done: true };
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
